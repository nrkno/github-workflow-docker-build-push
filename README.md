# Shared workflow for Docker build and push

Reusable GitHub workflow for building, scanning and pushing a Docker image to
a remote registry.

## Usage

Reference this repository for a workflow job. Please see the workflow file for
input and secret arguments.

```yaml
jobs:
  docker-build-push:
    uses: nrkno/github-workflow-docker-build/.github/workflows/workflow.yaml@v1
    with:
      <inputs>
    secrets:
      <secrets>
```

[workflow]: ./.github/workflows/workflow.yaml

## Notes

The *build*, *scan* and *push* phase have been split up to provide a proper
visualisation of the pipeline. They could have been merged together
for simplicity, but it would require a lot more `if: <expression>` for
the toggleable steps and their required setup steps and that would look
weird with a lot of skipped steps in the job summary.

Currently haven't found a good way to have a toggle for the vulnerability
scan while still requiring that step for the *push* job. Disabling scan
while the scan job is a requirement will prevent the dependant job from
running.

The registry URL must be passed as a secret when its sourced from a repository
secret. This is a limitation/security feature of reusable workflows, it seems.
This also prevents us from printing the full image refs in the summary output,
but also prevents us from exposing it as workflow outputs. This has been worked
around by outputting tags stripped of their registry URLs.

## References

- https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#onworkflow_callinputs
- https://docs.github.com/en/actions/using-workflows/reusing-workflows
