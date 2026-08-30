# Android patient chat API

The chat API is condition-based: a patient has a separate thread for every
`PatientCondition`. All REST calls use JSON over HTTPS except the direct upload
`PUT` to object storage. Production clients must use TLS for both REST and
Socket.IO.

## Authentication

Log in with `POST /api/v1/patient/login`:

```json
{
  "mobileNumber": "9876543210",
  "dateOfBirth": "1985-06-15T00:00:00.000Z"
}
```

The response includes `accessToken` alongside the patient profile. Store it in
Android encrypted storage and send it on every protected request:

```http
Authorization: Bearer <accessToken>
```

The same JWT can be supplied as `auth.token` during the Socket.IO handshake.
The browser-only `GET /api/v1/chat/socket-token` endpoint returns a five-minute
token and is not required by Android.

## REST workflow

All successful REST responses use `{ "success": true, "data": ... }`. Errors
use an appropriate HTTP status and `{ "success": false, "message": "..." }`.

### List condition threads

`GET /api/v1/chat/threads?limit=20&cursor=<threadId>`

Threads include patient/hospital/condition details, the latest message,
`unreadCount`, `writable`, and `nextCursor`. Omit `cursor` for the first page.
If `writable` is false, history remains available but sending and creating an
upload return `409`.

### Load history

`GET /api/v1/chat/threads/{conditionId}/messages?limit=50&before=<messageId>`

Messages are returned oldest-to-newest within each page. To load older history,
send the returned `nextCursor` as `before` and prepend that page to the existing
list.

### Send text

`POST /api/v1/chat/threads/{conditionId}/messages`

```json
{
  "clientMessageId": "5b57ebd8-4750-4e90-91d7-42044d915b45",
  "text": "My swelling has reduced today."
}
```

Generate one UUID per local message and reuse it for retries. The server's
unique constraint makes repeated requests with the same UUID idempotent.
Text is limited to 4,000 characters.

### Send an image or PDF

1. Request an upload with
   `POST /api/v1/chat/threads/{conditionId}/attachments/presign`:

   ```json
   {
     "fileName": "wound-photo.jpg",
     "mimeType": "image/jpeg",
     "byteSize": 248120
   }
   ```

2. `PUT` the raw file bytes to the returned `uploadUrl`, using every header in
   `requiredHeaders`. Do not send the Alivepost bearer token to this storage URL.
3. After the upload returns 2xx, create the message:

   ```json
   {
     "clientMessageId": "21efef08-ff76-459a-9ff0-61f7524c29dd",
     "text": "Photo from this morning",
     "attachmentId": "3b8968f0-fd6b-42a7-853a-0b961e90d18c"
   }
   ```

Allowed MIME types are `image/jpeg`, `image/png`, `image/webp`, and
`application/pdf`. Exactly one file up to 10 MiB is allowed per message. The
backend verifies the stored object's MIME type and byte length before accepting
the message.

### Open an attachment

`GET /api/v1/chat/attachments/{attachmentId}/download-url` returns a private,
short-lived `downloadUrl`. Fetch a new URL when the old one expires; do not cache
the signed URL as durable application data.

### Mark read

`POST /api/v1/chat/threads/{conditionId}/read`

```json
{ "messageId": 781 }
```

This marks every message through that message's timestamp as read. Read markers
only move forward.

## Socket.IO events

Connect to the backend origin at `/socket.io` with the JWT in `auth.token`.
After connection, subscribe to each visible thread:

- Emit `chat:join` with `{ "conditionId": 42 }`. The optional acknowledgement
  is `{ "success": true }` or `{ "success": false, "message": "..." }`.
- Emit `chat:leave` with `{ "conditionId": 42 }` when the thread is no longer
  needed.
- Listen for `message:new`, whose payload is `{ conditionId, message }`.
- Listen for `thread:updated` to refresh ordering and unread counts.
- Listen for `thread:read` to update sent-message read indicators.

REST remains authoritative: after reconnecting, reload threads and message
history to recover any events missed while offline. Socket room membership is
checked server-side against the JWT; guessing another condition ID does not
grant access.

## FCM behavior

Register/update the patient device token using the existing authenticated
`POST /api/v1/patient/fcm` endpoint. Hospital replies send an FCM notification
with data values:

```json
{ "type": "chat_message", "id": "42" }
```

`id` is the patient condition ID. Open that condition thread and refresh its
REST history when the notification is selected. Push delivery is best-effort;
the stored REST history is the source of truth.

## Status codes

- `400`: malformed payload, unsupported attachment, invalid cursor, or a
  mismatched uploaded object.
- `401`: bearer token missing, invalid, or expired.
- `403`: caller is not the patient or owning hospital for the condition.
- `404`: condition, message, or attachment does not exist.
- `409`: condition chat is read-only, upload is incomplete, or attachment has
  expired.
- `503`: the selected S3-compatible or Azure Blob attachment storage is not
  configured.

The complete machine-readable contract is also available through the project's
Swagger/OpenAPI document at `/api-docs` when enabled.
