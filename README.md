# Shared workflow for Docker build and push

Reusable GitHub workflow for building, scanning and pushing a Docker image to
a container registry.

## Usage

Set `permissions: contents: read` on the calling job. The workflow declares no
permissions of its own, so it inherits the caller's `GITHUB_TOKEN` permissions.
Grant more only when needed. For example, a caller that uses `GITHUB_TOKEN` as
`registry-password` to push to ghcr.io also needs `packages: write`.

Pull requests never publish. On `pull_request` and `pull_request_target` events
the image is built (to test that it builds) and may be scanned, but it is never
pushed to a registry, no layer cache is written, and no SBOM is submitted,
whatever the `push` input says. Use `pull_request` on a GitHub-hosted or
isolated ephemeral runner to build untrusted PR code, and do not pass privileged
secrets to it. The publication guard does not prevent the build from using
credentials that the caller explicitly supplies.

When no image is pushed, all five publication outputs are empty: `image-digest`,
both `image-ref` forms, and both `image-tags` forms. Use `image-digest` to
check whether there is a published image before consuming a reference. `unique-id`
is still available on successful build-only runs.

Pin the workflow by full commit SHA (replace `<sha>` and the version comment
with the latest release). Version tags are mutable.

```yaml
jobs:
  build-push:
    uses: nrkno/github-workflow-docker-build-push/.github/workflows/workflow.yaml@<sha> # v5.x.y
    permissions:
      contents: read
    with:
      runs-on: "['self-hosted', 'linux']"
      registry-url: myregistry.azurecr.io
      name: my-project-name/my-image-name
      # Tag with 'latest' tag when merging to main
      tag-latest: ${{ github.ref == 'refs/heads/main' }}
      # Only push when merging to main
      push: ${{ github.ref == 'refs/heads/main' }}
    secrets:
      registry-username: secret-string
      registry-password: secret-string
      token: ${{ secrets.GITHUB_TOKEN }}
```

<!-- autodoc start -->
### Inputs
- `cache` (boolean, default `true`) - Whether to read the registry layer cache and allow default-branch runs outside pull request events to write it.
- `cache-tag` (string, default `"buildcache"`) - Image tag to use for image layer cache.
- `context` (string, default `"."`) - The root directory for the Docker build context.
- `dockerfile` (string, default `"Dockerfile"`) - Path to a Dockerfile relative to the Docker build context path.
- `git-ref` (string, default `""`) - The branch, tag or SHA to checkout. Leave empty for the current branch ref.
- `git-submodules` (boolean, default `false`) - Whether to also checkout Git submodules.
- `push` (boolean, default `true`) - Push the built image to a registry after scanning. Ignored on pull request events.
- `name` (string, **required**) - Image name (repository path) within a registry.
- `ssh-agent` (boolean, default `false`) - Whether to start an SSH agent for the build.
- `tag-branch` (boolean, default `false`) - Tag a successfully built image with the branch name.
- `tag-sha` (boolean, default `true`) - Tag a successfully built image with the commit SHA that triggered the workflow.
- `tag-pr` (boolean, default `true`) - Generate a PR tag such as `pr-2` in image metadata. PR runs do not publish these tags.
- `tag-latest` (boolean, default `false`) - Tag a successfully built image with the tag latest.
- `tag-extra` (string, default `""`) - Comma-separated list of additional image tags.
- `registry-url` (string, **required**) - URL to the container registry.
- `runs-on` (string, default `"['self-hosted']"`) - Type of runner for the jobs. For non-self-hosted runners, use ubuntu-latest for example.
- `trivy-enabled` (boolean, default `true`) - Scan the built image for known vulnerabilities using Trivy.
- `trivy-error-is-success` (boolean, default `false`) - Test mode that expects vulnerability findings and allows the workflow to continue when they are found. Does not ignore scanner errors.
- `trivy-ignore-unfixed` (boolean, default `true`) - Ignore errors that do not have a known fix.
- `trivy-ignore-files` (string, default `""`) - Comma-separated list of paths to Trivy ignore files, relative to the repository root.
- `trivy-severity` (string, default `"MEDIUM,HIGH,CRITICAL"`) - Comma-separated list of severities to consider an error.
- `trivy-summary-enabled` (boolean, default `false`) - Render a table of all the Trivy findings in the GitHub summary for the workflow.
- `trivy-sbom-enabled` (boolean, default `false`) - Generate an SBOM of your dependencies and submit them to GitHub Dependency Graph.
- `build-args` (string, default `""`) - Newline separated list of build arguments to pass to the Docker build.
- `secrets` (string, default `""`) - secrets to use inside docker-build separated by newlines. ref: https://docs.docker.com/build/ci/github-actions/secrets/

### Secrets
- `git-ssh-key` - SSH key used by Git to checkout the repository.
- `registry-username` (**required**) - Username for the container registry.
- `registry-password` (**required**) - Password for the container registry.
- `token` (**required**) - GitHub auth token.
- `ssh-deploy-key` - SSH key to load in the SSH agent
- `npm-token` - NPM authentication token for private packages. Exposed to the build only as BuildKit secrets `npmrc` and `npm_token`, never as a build-arg.

### Outputs
- `image-digest` - The published image digest. Empty if no image was pushed.
- `image-ref` - The published image reference (`<registry-url>/<name>:<git-sha>@<digest>`). Empty if no image was pushed.
- `image-ref-stripped` - The published image reference without the registry URL (`<name>:<git-sha>@<digest>`). Empty if no image was pushed.
- `image-tags` - Comma-separated list of pushed image tags (`<registry-url>/<name>:<tag1>,<registry-url>/<name>:<tag2>`). Empty if no image was pushed.
- `image-tags-stripped` - Comma-separated list of pushed image tags without the registry URL (`<name>:<tag1>,<name>:<tag2>`). Empty if no image was pushed.
- `unique-id` - A generated unique ID for this run. Can be useful when debugging runners to determine artifact filenames.
<!-- autodoc end -->

## NPM token and build secrets

The `npm-token` secret is passed to the build as **BuildKit secrets**, never as
a build-arg (build-args are recorded in image history). Two secret ids are
provided:

- `npmrc` - a ready-made `.npmrc` line: `//registry.npmjs.org/:_authToken=<token>`
- `npm_token` - the bare token

Dockerfiles must read it in the `RUN` step that needs it:

```dockerfile
# Option 1: use the ready-made .npmrc
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci

# Option 2: read the bare token
RUN --mount=type=secret,id=npm_token \
    NPM_TOKEN="$(cat /run/secrets/npm_token)" npm ci
```

**Breaking change for Dockerfiles using `ARG NPM_TOKEN`:** the workflow no
longer injects an `NPM_TOKEN` build-arg, so such an `ARG` is now empty. Switch
to one of the secret mounts above. Rotate any npm token that was previously
passed this way, because it may be readable in published image history.

Secrets given in the `secrets` input are string inputs and are not masked by
GitHub. Do not put real secret values there; prefer the `npm-token` secret.

## Vulnerability scanning

When `trivy-enabled` is `true` (the default), the built image is scanned with
`aquasecurity/trivy-action@v0.36.0`, whose commit is recorded in `actions.lock`.
The workflow selects Trivy `v0.70.0` separately. Vulnerabilities reported at the
configured severities fail the job before image tags are pushed. Set
`trivy-error-is-success: true` only in tests that expect findings: the test fails
if there are no findings or the scanner itself fails.

When `trivy-sbom-enabled` is `true`, the SBOM is submitted to the Dependency
Graph with the `token` secret. A caller that passes `secrets.GITHUB_TOKEN` as
`token` must grant `contents: write` on the calling job; `contents: read` is not
enough. SBOMs are not submitted for pull requests.

## Migrating from v4 to v5

1. **The `NPM_TOKEN` build-arg is gone.** The npm token is now only available
   as BuildKit secrets (see above). In every Dockerfile that has
   `ARG NPM_TOKEN`:
   1. Delete the `ARG NPM_TOKEN` (and any `ENV` that copies it).
   2. In the `RUN` step that installs packages, mount the secret:
      `RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci`
   3. Rotate npm tokens that were passed as a build-arg: they may be readable
      in the history of images already published.
2. **Scan findings now block the image push.** v4.6 skipped scanning without
   saying so. By default, fixable MEDIUM, HIGH or CRITICAL findings fail the
   job before image tags are pushed. Fix the findings, add a Trivy ignore file
   (`trivy-ignore-files`), or narrow `trivy-severity`. Setting
   `trivy-enabled: false` disables this gate.
3. **Pull requests never push.** Callers that relied on `pr-<n>` images being
   pushed from `pull_request` events must build and push from a trusted
   non-PR run instead, such as a `push` to a protected branch. Skip
   downstream jobs that need a published reference when `image-digest` is empty.
4. **Checkout no longer saves Git credentials.** The `token` and optional
   `git-ssh-key` still authenticate the initial checkout, including submodules
   when enabled. Later Git commands must authenticate explicitly. If a Docker
   build needs private Git dependencies, supply a scoped BuildKit secret or SSH
   mount; do not copy checkout credentials into the build context. For SBOM
   submission, the passed `token` now needs `contents: write`, rather than
   relying on the implicit `GITHUB_TOKEN`.
5. **Only the default branch writes the registry layer cache.** With
   `cache: true`, PRs and other branches may read the existing cache, but only
   default-branch runs outside PR events (including scheduled runs) may write
   it. `push: false` controls image publication only; use `cache: false` to
   disable registry cache reads and writes.

Pin by SHA, or use the floating tags `v5` and `v5.<minor>`, which are moved on
each release. `v4` stays on the last v4 release and receives no further updates.

## Implementation notes

The *build*, *scan* and *push* phases have been merged into one job to
simplify workflow runs. This degrades the visualisation of the pipeline,
but the save in speed and maintenance is significant. To separate the steps
it is necessary to cache the built image between jobs, causing a lot of time
spent uploading and downloading artifacts.

Pass the registry host in the `registry-url` input and credentials in the
`registry-username` and `registry-password` secrets. If the host itself is
sourced from a secret, GitHub may suppress outputs containing it. The stripped
outputs omit the host.

## References

- https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#onworkflow_callinputs
- https://docs.github.com/en/actions/using-workflows/reusing-workflows
- https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#adding-a-job-summary

## Lockfile upkeep

`.github/workflows/actions.lock` is generated by the
[`gh actions-lock`](https://github.com/github/gh-actions-lock) extension. Step
`uses:` references keep full version tags (`actions/checkout@v7.0.1`); the
lockfile records the commit SHA each tag resolved to, including transitive
actions, and GitHub enforces those SHAs when the workflow runs. A moved or
re-pointed tag therefore cannot change what runs. Whenever a `uses:` reference
in `.github/workflows/` is added, removed or changed, update the lockfile in the
same PR:

```sh
gh extension install github/gh-actions-lock --pin v0.4.1  # once
gh actions-lock
```

Commit `actions.lock` together with any tag rewrite the extension makes.
Renovate regenerates the lockfile in its action-bump PRs; run the command above for hand edits.

Reusable workflow calls (`jobs.<job_id>.uses`) are not covered by the lockfile.
Keep them pinned to a full commit SHA with a `# vX.Y.Z` comment.
The `Actions lockfile` workflow runs `gh actions-lock --verify-local` on PRs that
touch `.github/workflows/` and fails if an action reference has no lockfile
entry. Do not edit the lockfile by hand.
