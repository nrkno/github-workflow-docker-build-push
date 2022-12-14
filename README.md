# Shared workflow for Docker build and push

Reusable GitHub workflow for building, scanning and pushing a Docker image to
a container registry.

## Usage

```yaml
jobs:
  build-push:
    uses: nrkno/github-workflow-docker-build-push/.github/workflows/workflow.yaml@v1
    with:
      runs-on: self-hosted
      name: my-project-name/my-image-name
      # Tag with 'latest' tag when merging to main
      tag-latest: ${{ github.ref == 'refs/heads/main' }}
      # Only push when merging to main
      push: ${{ github.ref == 'refs/heads/main' }}
    secrets:
      registry-url: secret-string
      registry-username: secret-string
      registry-password: secret-string
      token: ${{ secrets.GITHUB_TOKEN }}
```

### Outputs
- `image-digest`: The image digest for this build
- `image-ref-stripped`: An image reference for this build, stripped of its registry URL ("<name>:<sha>@<digest>")
    - It is not possible to include secret values in outputs, so `registry-url` must be stripped from the image name.
- `image-tags-stripped`: Comma-separated list of generated image tags for this build, stripped of their registry URL, without a leading slash (i.e. "<name1>:<tag1>,<name2>:<tag2>")
- `unique-id`: A generated unique ID for this run. Can be useful when debugging runners to determine artifact filenames.

Please see the [workflow file][workflow] for a list with descriptions of
all supported input and secret arguments.

[workflow]: ./.github/workflows/workflow.yaml

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
