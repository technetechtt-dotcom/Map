# Stakeholder repository training session

This is the facilitator script for administrators and stakeholder users. Completing this document does not by itself mean a live session was held. Record the date, attendees and environment in the session log at the bottom when the training is delivered.

Duration: 45 minutes. Environment: staging, not production.

## Administrators (20 minutes)

1. Sign in as a provincial or super administrator and open **Repository** in the operations menu.
2. Create two groups, for example `Steering Committee` and `Funding Partners`.
3. Add a different stakeholder email to each group. Confirm an unknown email is rejected.
4. Open **Innovation Repository**, upload a PDF titled `Training brief` and share it only with `Steering Committee`.
5. Upload a second version of that document and confirm the first remains under **Show versions and archives**.
6. Archive a document and confirm it leaves the active list but remains in history.
7. Open the audit log and find `REPOSITORY_DOCUMENT_CREATE`, `REPOSITORY_DOCUMENT_VIEW` and `REPOSITORY_DOCUMENT_DOWNLOAD`.

## Stakeholder users (15 minutes)

1. Sign in as the Steering Committee member. Confirm `Training brief` is listed and the file opens.
2. Sign in as the Funding Partners member. Confirm that document is not listed and its private download URL returns forbidden.
3. Sign in as a user from another organisation. Confirm organisation-only documents from the first organisation are not listed.
4. Submit an organisation, funding call, event or programme from **Submit** and show that it stays out of the public catalogue until Operations publishes or declines it.

## Pass criteria

- Group members can upload, view and download their document.
- A user outside the group, organisation or province cannot view or download it.
- A new version supersedes the previous file without deleting it.
- Archive hides the current file and keeps the audit history.
- View and download each create an audit row.

## Session log

| Date | Environment | Facilitator | Attendees | Result |
| --- | --- | --- | --- | --- |
|  | staging |  |  | Not yet delivered |
