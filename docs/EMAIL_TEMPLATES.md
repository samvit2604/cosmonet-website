# Cosmonet enquiry emails

The application renders both emails in [server/email.js](../server/email.js), with HTML and plain-text versions. No dashboard autoresponder or separate template service is required. Each accepted enquiry stores two email jobs alongside the saved lead.

| Email | Recipient | Reply-To | Subject |
| --- | --- | --- | --- |
| Team notification | `LEADS_TO`, normally `hello@cosmonet.ai` | Visitor’s submitted email | `New Cosmonet enquiry — [reference]` |
| Visitor confirmation | Visitor’s submitted email | `LEADS_TO`, normally `hello@cosmonet.ai` | `We have received your enquiry — [reference]` |

Both messages use `RESEND_FROM`, normally `Cosmonet <enquiries@notify.cosmonet.ai>`. The sending domain must be verified in Resend. This address is the sender; the existing `hello@cosmonet.ai` mailbox remains the team’s inbox and contact address. See [RESEND_SETUP.md](RESEND_SETUP.md).

## Team notification

The message heading is **New project enquiry**. It includes the saved reference, name, company, email, selected service, business stage, message and any campaign labels. An omitted business stage appears as **Not provided**.

The HTML version uses a restrained Cosmonet layout with a light background, white content panel and labeled fields. Visitor-supplied HTML is escaped; message line breaks are preserved. The plain-text version contains the same enquiry information. Replying to the notification addresses the visitor.

## Visitor confirmation

The current plain-text content is:

```text
Hello,

Thank you for contacting Cosmonet. We have received your enquiry.

Your reference: [reference]

Our team will review your message and respond to this email. You can reply to this email to add information.

Cosmonet
hello@cosmonet.ai
```

The HTML version carries the same wording and reference. `[reference]` is filled by the application; it is not a provider template variable. The final contact address follows `LEADS_TO`.

The confirmation excludes the visitor’s free-form message and campaign links, and promises no response deadline. Its Reply-To is the team inbox, so the visitor can add information by replying.

## Changes and delivery checks

Edit `server/email.js` to change future emails. Each queued job retains its original rendered payload so retries keep the same provider request body, even across deployments or sender-setting changes. Existing queued jobs therefore keep their stored content.

The form receipt means the enquiry and email jobs were saved. A provider-accepted email is a later state; a delivered webhook is another later state. None establishes that a person read the email or that it reached the primary inbox.

After configuring real credentials, use a mailbox you control for one production-domain test. Check both messages, their From and Reply-To headers, subjects, references, text/HTML rendering, enquiry fields and spam folders. Confirm that replying to the team notification addresses the visitor and replying to the confirmation addresses `hello@cosmonet.ai`.

Real email delivery has not been verified merely by adding this implementation. Automated tests mock the transport and do not send email.
