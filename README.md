# Shared workflow for Docker build and push

Reusable GitHub workflow for building, scanning and pushing a Docker image to
a container registry.

## Usage

Set `permissions: contents: read` on the calling job. The workflow declares no
permissions of its own, so it runs with the caller's `GITHUB_TOKEN`. A token
passed as the `token` or `registry-password` secret keeps the caller's
permissions (for example `packages: write` when pushing to ghcr.io).

Pull requests never publish. On `pull_request` and `pull_request_target` events
the image is built (to test that it builds) and may be scanned, but it is never
pushed to a registry, no layer cache is written, and no SBOM is submitted,
whatever the `push` input says. The `image-digest` and `image-tags` outputs are
empty for these events.

Pin the workflow by full commit SHA (replace `<sha>` and the version comment
with the latest release). Version tags are mutable.

```yaml
jobs:
  build-push:
    uses: nrkno/github-workflow-docker-build-push/.github/workflows/workflow.yaml@<sha> # v5.x.y
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
- `cache` (boolean, default `true`) - Whether to enable image layer cache.
- `cache-tag` (string, default `"buildcache"`) - Image tag to use for image layer cache.
- `context` (string, default `"."`) - The root directory for the Docker build context.
- `dockerfile` (string, default `"Dockerfile"`) - Path to a Dockerfile relative to the Docker build context path.
- `git-ref` (string, default `""`) - The branch, tag or SHA to checkout. Leave empty for the current branch ref.
- `git-submodules` (boolean, default `false`) - Whether to also checkout Git submodules.
- `push` (boolean, default `true`) - Push a successfully built image to a registry.
- `name` (string, **required**) - Image name (repository path) within a registry.
- `ssh-agent` (boolean, default `false`) - Whether to start an SSH agent for the build.
- `tag-branch` (boolean, default `false`) - Tag a successfully built image with the branch name.
- `tag-sha` (boolean, default `true`) - Tag a successfully built image with the commit SHA that triggered the workflow.
- `tag-pr` (boolean, default `true`) - Tag a successfully built image with reference to a Pull Request, e.g. pr-2.
- `tag-latest` (boolean, default `false`) - Tag a successfully built image with the tag latest.
- `tag-extra` (string, default `""`) - Comma-separated list of additional image tags.
- `registry-url` (string, **required**) - URL to the container registry.
- `runs-on` (string, default `"['self-hosted']"`) - Type of runner for the jobs. For non-self-hosted runners, use ubuntu-latest for example.
- `trivy-enabled` (boolean, default `true`) - Scan the built image for known vulnerabilities using Trivy.
- `trivy-error-is-success` (boolean, default `false`) - Do not produce an error if the Trivy scan fails. Primarily used for testing.
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
- `image-digest` - The image digest for this build.
- `image-ref` - An image reference for this build (`<name>:<git-sha>@<digest>`).
- `image-ref-stripped` - An image reference for this build, stripped of its registry URL (`<name>:<git-sha>@<digest>`).
- `image-tags` - Comma-separated list of generated image tags for this build, (`<registry-url>/<name1>:<tag1>,<registry-url>/<name1>:<tag2>`).
- `image-tags-stripped` - Comma-separated list of generated image tags for this build, stripped of their registry URL, without a leading slash (`<name1>:<tag1>,<name1>:<tag2>`).
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
`aquasecurity/trivy-action`, pinned by commit SHA to the immutable `v0.36.0`
release, with Trivy `v0.70.0`. Findings fail the job, so
nothing is pushed, unless `trivy-error-is-success` is set. The layer cache is written only from the
repository's default branch.

When `trivy-sbom-enabled` is `true`, the SBOM is submitted to the Dependency
Graph with the `token` secret. A caller that passes `secrets.GITHUB_TOKEN` as
`token` must grant `contents: write` on the calling job; `contents: read` is not
enough. SBOMs are not submitted for pull requests.

## Migrating from v4 to v5

v5 has three breaking changes.

1. **The `NPM_TOKEN` build-arg is gone.** The npm token is now only available
   as BuildKit secrets (see above). In every Dockerfile that has
   `ARG NPM_TOKEN`:
   1. Delete the `ARG NPM_TOKEN` (and any `ENV` that copies it).
   2. In the `RUN` step that installs packages, mount the secret:
      `RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci`
   3. Rotate npm tokens that were passed as a build-arg: they may be readable
      in the history of images already published.
2. **Scan findings now block the push.** v4.6 skipped scanning without saying
   so. Images with fixable MEDIUM, HIGH or CRITICAL findings now fail the job
   before anything is pushed. Fix the findings, add a Trivy ignore file
   (`trivy-ignore-files`), narrow `trivy-severity`, or set `trivy-enabled: false`
   or `trivy-error-is-success: true` knowingly.
3. **Pull requests never push.** Callers that relied on `pr-<n>` images being
   pushed from `pull_request` events must build and push from a branch or
   `push` event instead.

Pin by SHA, or use the floating tags `v5` and `v5.<minor>`, which are moved on
each release. `v4` stays on the last v4 release and receives no further updates.

## Implementation notes

The *build*, *scan* and *push* phases have been merged into one job to
simplify workflow runs. This degrades the visualisation of the pipeline,
but the save in speed and maintenance is significant. To separate the steps
it is necessary to cache the built image between jobs, causing a lot of time
spent uploading and downloading artifacts.

The registry URL must be passed as a secret when it's sourced from a repository
secret. This prevents us from printing the full image refs in the workflow
outputs and job summary. This has been worked around by outputting tags stripped
of their registry URLs.

## References

- https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#onworkflow_callinputs
- https://docs.github.com/en/actions/using-workflows/reusing-workflows
- https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#adding-a-job-summary
