# Security policy

## Supported versions

Security fixes go into the newest release. Please update before reporting, and
check whether the problem is still there.

| Version | Supported |
| --- | --- |
| 0.5.x (latest release) | Yes |
| Anything older | No |

## Reporting a vulnerability

**Do not open a public issue for a security problem.** Use GitHub's private
reporting instead: on the repository's **Security** tab, choose **Report a
vulnerability**. Include what you found, the steps to reproduce it, the version and
platform, and what an attacker could do with it.

You can expect an acknowledgement within a week. We will keep you informed while it
is fixed and credit you in the release notes, unless you would rather not be named.

## What counts

FormEncoder runs on your own machine, so the things that matter most are the ways
something outside it could get in:

- **The engine** binds to loopback (127.0.0.1, port 8270). Anything that makes it
  reachable from another machine, or lets a web page drive it.
- **Agents and the terminal**: getting an agent's consequential action (deleting,
  overwriting, publishing, typing into a terminal) to run without the person's
  approval, or getting past the first-change consent.
- **Publish credentials** (FTP, S3, YouTube, Vimeo, Facebook and webhook secrets):
  anything that leaks them.
- **Webhooks**: forging or replaying a signed export notification from formcut, or a
  signed publish notification.
- **Files**: importing, ingesting, watching or extracting media in a way that writes
  outside where it should.
- **FormEncoder's FFmpeg and delivery tools**: anything that gets a download past the
  check of every file against the record FormEncoder carries.

Bugs that need someone to already control your machine, or to run a modified build
of FormEncoder, are ordinary bugs: please open an issue for those.
