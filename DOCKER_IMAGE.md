# Docker image for this repository

## Should the image be committed into git?
Technically possible, but not recommended.
A Docker image is a large binary artifact and will bloat repository history.

Recommended approach: keep source + `Dockerfile` in repo, and publish image to container registry tied to repo (GHCR).

## What is configured now
- Production-ready multi-stage `Dockerfile`
- GitHub Actions workflow: `.github/workflows/docker-image.yml`
  - Builds image on pull requests
  - Builds and pushes image on `main`, tags `v*`, and manual dispatch
  - Publishes to: `ghcr.io/<owner>/<repo>`

## Local build
```bash
docker build -t task-api:local .
docker run --rm -p 5000:5000 --env-file .env task-api:local
```

## Pull from GHCR
```bash
docker pull ghcr.io/<owner>/<repo>:latest
docker run --rm -p 5000:5000 --env-file .env ghcr.io/<owner>/<repo>:latest
```

## If you really need image inside repo
You can export image tarball:
```bash
docker save ghcr.io/<owner>/<repo>:latest -o docker-image.tar
```
But this should be avoided in normal development workflows.
