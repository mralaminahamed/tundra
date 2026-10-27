# Tundra Release Provenance (SLSA Level 3 target)

## Status

The release workflow (`.github/workflows/release.yml`, job `slsa-provenance`) calls the SLSA Level 3 generic generator `slsa-framework/slsa-github-generator/.github/workflows/generator_generic_slsa3.yml@v2.1.0`. No release has run it: the repository has tags (up to `v1.0.0`) but no GitHub release, no `release.yml` run, and no published provenance file. No SLSA level is demonstrated by this repository today.

The workflow would attest only the linux x86_64 tarball. The linux arm64 and macOS artefacts are not subjects of the provenance.

## Known issue

The job passes `base64-subjects` the bare hex digest from the `Compute digest` step (`sha256sum ... | awk '{print $1}'`). The generator documents that this input must decode to `sha256sum` output, a hash followed by a space and the artefact name, base64 encoded (`internal/builders/generic/README.md` at v2.1.0). The current value does not match that format, so the provenance step is expected to fail until the workflow is corrected.

## Intended design

- Builds run in ephemeral GitHub Actions environments.
- Build provenance is signed through Sigstore, with no long-lived signing key.
- The SLSA verifier can confirm which source commit produced which binary.

The sections below describe how verification is intended to work once a release produces provenance. The URLs refer to artefacts that do not exist yet.

## Verifying a release

```bash
# Install the SLSA verifier
go install github.com/slsa-framework/slsa-verifier/v2/cli/slsa-verifier@latest

# Download the artefact and its provenance
curl -Lo tundrad.tar.zst https://github.com/mralaminahamed/tundra/releases/download/v1.0.0/tundrad-1.0.0-linux-x86_64.tar.zst
curl -Lo provenance.intoto.jsonl https://github.com/mralaminahamed/tundra/releases/download/v1.0.0/multiple.intoto.jsonl

# Verify
slsa-verifier verify-artifact tundrad.tar.zst \
  --provenance-path provenance.intoto.jsonl \
  --source-uri github.com/mralaminahamed/tundra \
  --source-tag v1.0.0
```

## Minisign verification

Each artefact is also signed with minisign. The public key is embedded in `installer/install.sh`:

```
RWTg/+jJF1KMagVo4qwxcMMWWJgRb5LBkBPAX/BoMsS+cM2qpNbKJJqF
```

```bash
minisign -V \
  -p <(echo 'RWTg/+jJF1KMagVo4qwxcMMWWJgRb5LBkBPAX/BoMsS+cM2qpNbKJJqF') \
  -m tundrad-1.0.0-linux-x86_64.tar.zst \
  -x tundrad-1.0.0-linux-x86_64.tar.zst.minisig
```
