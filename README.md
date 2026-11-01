# setup-plastic-scm

A GitHub action to setup and install [Plastic SCM](https://www.plasticscm.com) (Unity VCS).

## How to use

### workflow

```yaml
steps:
  - uses: RageAgainstThePixel/setup-plastic-scm@v2
  - run: |
      cm version
```

### inputs

| name | description | required |
| ---- | ----------- | -------- |
| `version` | The specific 4 part version to install, for example `11.0.16.9156`. If a different `cm` is already installed, the requested version is installed over it. | defaults to `latest` |

On Windows and macOS the action downloads the Unity VCS cloud edition installer. On Linux it installs from Unity's UVCS apt repository: `latest` installs the `plasticscm-cloud` package, and a pinned `version` pins every Plastic SCM package to that version.

### outputs

- `path`: The full path to the `cm` executable.
- `version`: The installed Plastic SCM version.

### environment variables

- `PLASTIC_SCM_PATH`: The full path to the `cm` executable.

