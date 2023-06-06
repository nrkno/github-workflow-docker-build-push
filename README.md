# Shared workflow for Docker build and push

Reusable GitHub workflow for building, scanning and pushing a Docker image to
a container registry.

## Usage

```yaml
jobs:
  build-push:
    uses: nrkno/github-workflow-docker-build-push/.github/workflows/workflow.yaml@v3.0.0
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
- `context` (string, default `"."`) - The root directory for the Docker build context.
- `dockerfile` (string, default `"Dockerfile"`) - Path to a Dockerfile relative to the Docker build context path.
- `push` (boolean, default `true`) - Push a successfully built image to a registry.
- `name` (string, **required**) - Image name (repository path) within a registry.
- `tag-latest` (boolean, default `false`) - Tag a successfully built image with the tag latest.
- `registry-url` (string, **required**) - URL to the container registry.
- `runs-on` (string, default `"['self-hosted']"`) - Type of runner for the jobs. For non-self-hosted runners, use ubuntu-latest for example.
- `trivy-enabled` (boolean, default `true`) - Scan the built image for known vulnerabilities using Trivy.
- `trivy-error-is-success` (boolean, default `false`) - Do not produce an error if the Trivy scan fails. Primarily used for testing.
- `trivy-ignore-unfixed` (boolean, default `true`) - Ignore errors that do not have a known fix.
- `trivy-ignore-files` (string, default `""`) - Comma-separated list of paths to Trivy ignore files, relative to the repository root.
- `trivy-severity` (string, default `"MEDIUM,HIGH,CRITICAL"`) - Comma-separated list of severities to consider an error.

### Secrets
- `registry-username` (**required**) - Username for the container registry.
- `registry-password` (**required**) - Password for the container registry.
- `token` (**required**) - GitHub auth token.

### Outputs
- `image-digest` - The image digest for this build.
- `image-ref-stripped` - An image reference for this build, stripped of its registry URL ("<name>:<sha>@<digest>").
- `image-tags-stripped` - Comma-separated list of generated image tags for this build, stripped of their registry URL, without a leading slash (i.e. "<name1>:<tag1>,<name2>:<tag2>").
- `unique-id` - A generated unique ID for this run. Can be useful when debugging runners to determine artifact filenames.
<!-- autodoc end -->

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
