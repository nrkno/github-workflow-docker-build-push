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

Please see the [workflow file][workflow] for a list with descriptions of
all supported input and secret arguments.

[workflow]: ./.github/workflows/workflow.yaml

## Implementation notes

The *build*, *scan* and *push* phases have been merged into one job to
simplify workflow runs. This degrades the visualisation of the pipeline,
but the cost in speed and maintenance is too significant.

The registry URL must be passed as a secret when its sourced from a repository
secret. This seems to be  a limitation/security feature of reusable workflows.
This also prevents us from printing the full image refs in the summary output,
but also prevents us from exposing it as workflow outputs. This has been worked
around by outputting tags stripped of their registry URLs.

## References

- https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#onworkflow_callinputs
- https://docs.github.com/en/actions/using-workflows/reusing-workflows
- https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#adding-a-job-summary
