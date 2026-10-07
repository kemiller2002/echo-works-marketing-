/**
 * EchoWorks static-site inquiry adapter.
 *
 * GitHub Pages has no form backend. This intentionally prepares a mailto draft
 * with the visitor's field values, rather than claiming a message was submitted.
 * A real server-side submission endpoint can replace only this transport later.
 */
const RECIPIENT = "jacquelyn.brice@echoworks.studio";

function singleLine(value, maxLength) {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, maxLength);
}

export function createInquiryMailto(fields = {}) {
  const name = singleLine(fields.name, 100);
  const email = singleLine(fields.email, 254);
  const phone = singleLine(fields.phone, 40);
  const projectType = singleLine(fields.projectType, 80) || "General inquiry";
  const location = singleLine(fields.location, 150);
  const message = String(fields.message ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 1200);

  const subject = "EchoWorks inquiry: " + projectType;
  const body = [
    "Hello EchoWorks,",
    "",
    "Name: " + name,
    "Email: " + email,
    "Phone: " + (phone || "Not provided"),
    "Project type: " + projectType,
    "Project location: " + (location || "Not provided"),
    "",
    "Project details:",
    message,
    "",
    "— Prepared on the EchoWorks website"
  ].join("\n");

  return "mailto:" + RECIPIENT
    + "?subject=" + encodeURIComponent(subject)
    + "&body=" + encodeURIComponent(body);
}

if (typeof document !== "undefined") {
  const form = document.querySelector('[data-testid="inquiry-form"]');
  const status = document.getElementById("inquiry-status");
  const draftLink = document.getElementById("inquiry-draft-link");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const fields = Object.fromEntries(new FormData(form));
    const url = createInquiryMailto(fields);
    if (draftLink) {
      draftLink.href = url;
      draftLink.hidden = false;
    }
    if (status) {
      status.textContent = "Your email application should open with a prepared message. Review it and press Send to contact EchoWorks. If it did not open, use the draft link below.";
    }
    window.location.href = url;
  });
}
