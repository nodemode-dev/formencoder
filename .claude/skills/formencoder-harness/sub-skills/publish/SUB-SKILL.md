---
name: publish
description: What formencoder does with a file after encoding it. Use when an output should be copied to a folder or network share, uploaded over FTP or FTPS, put in an S3 or S3-compatible bucket, announced to a webhook, uploaded to YouTube, Vimeo or a Facebook Page, handed to a plug-in, or imported into formcut or formvfx; when publish results or failures need reading; or when credentials for a destination are involved.
---

# publish

An output's `publish` setting is a list of destinations. They run in order after the encode succeeds; each result is recorded on the output. A destination with `enabled: false` is kept but skipped. `deleteLocal` on a folder or S3 destination removes the local files only when every destination of that output succeeded.

| type | Fields | Does |
| --- | --- | --- |
| `folder` | `path`, `deleteLocal` | copies the file (and its sidecars) into `path` |
| `ftp` | `host`, `port`, `user`, `password`, `remotePath`, `tls`, `retries` | uploads; `tls: true` for FTPS |
| `s3` | `endpoint`, `region`, `bucket`, `prefix`, `accessKey`, `secretKey`, `deleteLocal` | uploads to S3 or any S3-compatible store (`endpoint` for MinIO, R2, Wasabi) |
| `webhook` | `url`, `secret` | POSTs JSON describing the output and file, signed with HMAC-SHA256 of the body in `x-formencoder-signature` |
| `family` | `app: formcut|formvfx`, `project` | imports the file into the running app (see `form-family-bridge`) |
| `youtube` | `clientId`, `clientSecret`, `refreshToken`, `title`, `description`, `tags`, `categoryId`, `privacy`, `madeForKids` | resumable upload through the YouTube Data API with the person's OAuth refresh token |
| `vimeo` | `accessToken`, `title`, `description`, `privacy` | tus upload with a Vimeo personal access token that has the upload scope |
| `facebook` | `appId`, `userToken`, `pageId`, `pageToken`, `title`, `description`, `graphVersion` | resumable upload to a Facebook Page through the Graph API |
| `plugin` | `plugin`, `options` | hands the files to an installed plug-in's publish event (`execute plugin.list`; `docs/PLUGINS.md`) |

Titles default to the file name and take `{name}`, `{source}` and `{preset}`. YouTube, Vimeo and Facebook upload the output's video file. YouTube uploads are private unless `privacy` says otherwise; Vimeo follows the account's default unless `privacy` (`anybody`, `nobody`, `unlisted`...) is set. Say which when you deliver. The tokens come from the person's own developer app or account: formencoder does not hold a client of its own.

## Setting it

`publish` in a patch replaces the whole list, so read the current list first when adding one:

```json
{"publish": [{"type": "folder", "path": "/Volumes/Share/Delivery"}, {"type": "webhook", "url": "https://example.test/hooks/encoded", "secret": "..."}]}
```

Put destinations in a preset (`presets {action: create, fromOutput}`) when the same delivery repeats; watch folder outputs carry them too.

## Results

`execute encode.report {outputs}` returns each output's publish results: the destination type, `ok` or the `error`, and what was `sent` where. A publish failure does not fail the encode: the file is still made, and the report says which destination failed and why. Fix the destination and `queue {action: resetStatus}` to encode and publish again, or copy the file by other means and say so.

## Credentials

- Ask the person to type passwords and keys into the Export Settings window's Publish section when they prefer not to paste them into the conversation (`ui {action: exportSettings, output}` opens it).
- Never echo a password, key or webhook secret back in a reply, a log line or a ledger. Describe the destination by host and path only.
- Warn before saving a preset that contains credentials, because exported presets carry them.
- `deleteLocal` removes the only local copy after upload; turn it on only when asked.
