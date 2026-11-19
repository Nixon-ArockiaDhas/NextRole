import { importJobAlert, MAX_ALERT_BYTES } from "../../../../services/job-alerts";
import { reviewProfile } from "../../../../services/profile-review";
import { saveLinkedInJob, removeLinkedInJob } from "../../../../services/saved-jobs";
import { NextRequest, NextResponse } from "next/server";
import { MongoServerError } from "mongodb";
import { z } from "zod";
import { currentAccount, emailField, limit, login, logout, passwordField, register } from "../../../../services/accounts";
import { audit, database } from "../../../../services/database";
import { type Profile, type MasterResume, profileSchema, uploadResume, fillProfileFromSavedResume } from "../../../../services/resumes";
import { resetPassword, sendReset } from "../../../../services/reset";

type Context = { params: Promise<{ action?: string[] }> };
const privateHeaders = { "Cache-Control": "private, no-store" };
const feedback = (path: string, message: string, kind: "error" | "success") =>
  new Response(null, { status: 303, headers: { Location: `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(message)}`, ...privateHeaders } });

export async function GET(_request: NextRequest, context: Context) {
  const [action, id, extra] = (await context.params).action ?? [];
  if (action !== "download" || !id || extra) return new Response(null, { status: 404 });
  try {
    const account = await currentAccount();
    if (!account) return new Response(null, { status: 401, headers: privateHeaders });
    const { client, db } = await database();
    const resume = await db.collection<MasterResume>("masterResumes").findOne({ _id: id, userId: account._id });
    if (!resume) return new Response(null, { status: 404, headers: privateHeaders });
    await client.withSession((session) => audit(account._id, "Master resume downloaded", id, "USER", session));
    const name = resume.name.replace(/[^a-zA-Z0-9 ._-]/g, "_");
    return new Response(new Uint8Array(resume.file.value()), { headers: {
      ...privateHeaders, "Content-Type": resume.mime, "Content-Disposition": `attachment; filename="${name}"`,
    } });
  } catch {
    return new Response("Workspace storage is unavailable.", { status: 503, headers: privateHeaders });
  }
}

export async function POST(request: NextRequest, context: Context) {
  const [action, extra] = (await context.params).action ?? [];
  const allowedOrigin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : request.nextUrl.origin;
  if (extra || !action) return new Response(null, { status: 404 });
  if (request.headers.get("origin") !== allowedOrigin) return new Response("Request origin is not allowed.", { status: 403 });
  const paths: Record<string, string> = { login: "/login", register: "/register", forgot: "/forgot", reset: "/reset", logout: "/settings", profile: "/profile", upload: "/resumes", "fill-profile": "/resumes", "review-profile": "/resumes", "delete-resume": "/resumes", automation: "/automation", "save-job": "/discover", "remove-job": "/discover", "import-job-alert": "/recommended", "track-job": "/applications", "application-status": "/applications" };
  if (!Object.hasOwn(paths, action)) return new Response(null, { status: 404 });
  let path = paths[action];
  const size = Number(request.headers.get("content-length"));
  if (!Number.isFinite(size) || size <= 0 || size > (action === "upload" ? 5_350_000 : action === "import-job-alert" ? MAX_ALERT_BYTES + 4096 : 80_000)) {
    return feedback(path, "The request exceeds the allowed size.", "error");
  }

  try {
    const form = await request.formData();
    if (["login", "register", "forgot", "reset"].includes(action)) {
      const token = z.string().regex(/^[\w-]{43}$/).safeParse(form.get("token"));
      if (action === "reset" && token.success) path = `/reset?token=${token.data}`;
      const email = emailField.safeParse(form.get("email"));
      const password = action === "login" ? z.string().min(1).max(72).safeParse(form.get("password")) : passwordField.safeParse(form.get("password"));
      const valid = action === "reset" ? token.success && password.success : email.success && (action === "forgot" || password.success);
      if (!valid) return feedback(paths[action], "Check your details and use a password of at least 12 characters when setting a new password.", "error");
      const limitKey = action === "reset" && token.success ? token.data : email.data;
      if (!(await limit(`${action}:${limitKey}`, 8))) return feedback(paths[action], "Too many attempts. Try again in 15 minutes.", "error");
      if (action === "forgot" && email.success) {
        const configured = await sendReset(email.data);
        return feedback(path, configured ? "If an account exists, a reset link will arrive by email." : "Password reset email requires SMTP configuration.", configured ? "success" : "error");
      }
      if (action === "reset" && token.success && password.success) {
        if (await resetPassword(token.data, password.data)) return feedback("/login", "Password updated. Sign in again.", "success");
        return feedback("/forgot", "This reset link has expired or was already used.", "error");
      }
      if (!email.success || !password.success) return new Response(null, { status: 400 });
      if (action === "register") {
        const name = z.string().trim().min(2).max(100).safeParse(form.get("name"));
        if (!name.success) return feedback(path, "Enter your full name.", "error");
        await register(name.data, email.data, password.data);
      } else if (!(await login(email.data, password.data))) {
        return feedback(path, "Email or password is incorrect.", "error");
      }
      return NextResponse.redirect(new URL("/", allowedOrigin), 303);
    }

    const account = await currentAccount();
    if (!account) return feedback("/login", "Sign in to access your workspace.", "error");
    const userId = account._id;
    if (!(await limit(`${userId}:${action}`, action === "upload" ? 6 : 60))) return feedback(path, "Too many requests. Try again in 15 minutes.", "error");
    if (action === "logout") {
      await logout(userId);
      return NextResponse.redirect(new URL("/login", allowedOrigin), 303);
    }
    if (action === "upload") {
      const file = form.get("resume");
      const status = file instanceof File ? await uploadResume(userId, file) : null;
      if (!status) return feedback(path, "Choose a valid PDF, DOCX or TXT file up to 5 MB.", "error");
      const message = {
        parsed: "Original saved. Extracted details were used to fill blank profile fields.",
        local: "Original saved. Available details were used to fill blank profile fields.",
        unconfigured: "Original saved. No profile fields could be extracted from this document.",
        failed: "Original saved. The AI provider could not extract a profile.",
        no_text: "Original saved. This document has no extractable text.",
        unreadable: "Original saved. The document parser could not read its contents.",
      }[status];
      return feedback(path, message, "success");
    }
    if (action === "import-job-alert") {
      const file = form.get("emailFile");
      const text = form.get("emailText");
      const hasFile = file instanceof File && file.size > 0;
      const pasted = typeof text === "string" ? text.trim() : "";
      if ((!hasFile && !pasted) || (hasFile && pasted)) return feedback(path, "Upload one .eml file or paste one alert.", "error");
      if (hasFile && (!/\.eml$/i.test(file.name) || file.size > MAX_ALERT_BYTES)) return feedback(path, "Choose an .eml file up to 1 MB.", "error");
      if (Buffer.byteLength(pasted) > MAX_ALERT_BYTES) return feedback(path, "The pasted alert exceeds 1 MB.", "error");
      const result = await importJobAlert(userId, hasFile ? Buffer.from(await file.arrayBuffer()) : pasted);
      if (!result.found) return feedback(path, "No supported direct job links were found. Try pasting the job links from the alert.", "error");
      return feedback(path, `Imported ${result.added} new job(s). ${result.found - result.added} already saved.`, "success");
    }
    if (action === "save-job") {
      const result = await saveLinkedInJob(userId, form);
      if (result === "saved") return feedback(path, "LinkedIn job saved.", "success");
      if (result === "duplicate") return feedback(path, "That LinkedIn job is already saved.", "error");
      return feedback(path, "Enter a LinkedIn job posting URL, job title, and company.", "error");
    }
    if (action === "remove-job") {
      const id = z.string().regex(/^\d{1,20}$/).safeParse(form.get("sourceId"));
      if (id.success && await removeLinkedInJob(userId, id.data)) return feedback(path, "Saved job removed.", "success");
      return feedback(path, "Saved job could not be found.", "error");
    }
    if (action === "delete-resume") {
      const id = z.uuid().safeParse(form.get("resumeId"));
      if (!id.success) return feedback(path, "Invalid resume.", "error");
      const { client, db } = await database();
      const deleted = await client.withSession(session => session.withTransaction(async () => {
        const result = await db.collection<MasterResume>("masterResumes").deleteOne({ _id: id.data, userId }, { session });
        if (!result.deletedCount) return false;
        await db.collection("profileReviews").deleteMany({ userId, resumeId: id.data }, { session });
        await audit(userId, "Master resume deleted", id.data, "USER", session);
        return true;
      }));
      return feedback(path, deleted ? "Resume deleted." : "Resume not found.", deleted ? "success" : "error");
    }
    if (action === "review-profile") {
      const input = z.object({
        resumeId: z.uuid(), revision: z.string().regex(/^[a-f0-9]{64}$/),
        fields: z.array(z.string().max(50)).max(35),
      }).safeParse({ resumeId: form.get("resumeId"), revision: form.get("revision"), fields: form.getAll("fields") });
      if (!input.success) return feedback(path, "Invalid review request.", "error");
      const result = await reviewProfile(userId, input.data.resumeId, input.data.revision, input.data.fields);
      if (result === "saved") return feedback("/profile", "Resume review approved.", "success");
      return feedback(`/resumes/${input.data.resumeId}/review`, result === "stale" ? "Your profile changed. Review the latest values and try again." : "The review could not be saved.", "error");
    }
    if (action === "fill-profile") {
      const id = z.uuid().safeParse(form.get("resumeId"));
      const result = id.success ? await fillProfileFromSavedResume(userId, id.data) : null;
      if (!result) return feedback(path, "Resume not found.", "error");
      if (result.noFields) return feedback(path, "No profile details could be extracted from this resume.", "error");
      return feedback(path, result.filled ? `Filled ${result.filled} profile fields.` : "Your profile already has values for the extracted fields.", "success");
    }
    const { client, db } = await database();
    if (action === "track-job") {
      const sourceId = z.string().regex(/^\d{1,20}$/).safeParse(form.get("sourceId"));
      if (!sourceId.success) return feedback(path, "Select a saved job.", "error");
      await client.withSession((session) => session.withTransaction(async () => {
        const job = await db.collection("savedLinkedInJobs").findOne({ userId, sourceId: sourceId.data }, { session });
        if (!job) throw new Error("Saved job missing");
        const result = await db.collection("applications").updateOne(
          { userId, sourceId: sourceId.data },
          { $setOnInsert: { userId, sourceId: sourceId.data, title: job.title, company: job.company,
            status: "Requires User Action", updatedAt: new Date(), createdAt: new Date(), schemaVersion: 1 } },
          { session, upsert: true },
        );
        if (result.upsertedCount) await audit(userId, "Application tracking started", sourceId.data, "USER", session);
      }));
      return feedback(path, "Job added to your application tracker.", "success");
    }
    if (action === "application-status") {
      const input = z.object({
        sourceId: z.string().regex(/^\d{1,20}$/),
        status: z.enum(["Requires User Action", "Viewed Only", "Preparing Application", "Withdrawn"]),
      }).safeParse(Object.fromEntries(form));
      if (!input.success) return feedback(path, "Choose a valid status.", "error");
      await client.withSession((session) => session.withTransaction(async () => {
        const previous = await db.collection("applications").findOneAndUpdate(
          { userId, sourceId: input.data.sourceId, status: { $ne: "Applied" } },
          { $set: { status: input.data.status, updatedAt: new Date() } }, { session },
        );
        if (!previous) throw new Error("Application missing or confirmed");
        await db.collection("applicationEvents").insertOne({
          userId, sourceId: input.data.sourceId, previousStatus: previous.status,
          status: input.data.status, at: new Date(), actor: "USER",
        }, { session });
        await audit(userId, "Application status updated", input.data.sourceId, "USER", session, {
          previousStatus: previous.status, status: input.data.status,
        });
      }));
      return feedback(path, "Application status updated.", "success");
    }
    if (action === "profile") {
      const profile = profileSchema.safeParse(Object.fromEntries(form));
      if (!profile.success) return feedback(path, "Check your profile fields and try again.", "error");
      await client.withSession((session) => session.withTransaction(async () => {
        await db.collection<{ _id: string; userId: string; fields: Profile }>("userProfiles").updateOne(
          { _id: userId }, { $set: { userId, fields: profile.data } }, { upsert: true, session },
        );
        await audit(userId, "Professional profile updated", userId, "USER", session);
      }));
      return feedback(path, "Profile updated.", "success");
    }
    if (action === "automation") {
      const active = form.get("active");
      if (active !== "true" && active !== "false") return new Response(null, { status: 400 });
      await client.withSession((session) => session.withTransaction(async () => {
        await db.collection<{ _id: string; userId: string; active: boolean }>("userPreferences").updateOne(
          { _id: userId }, { $set: { userId, active: active === "true" } }, { upsert: true, session },
        );
        await audit(userId, active === "true" ? "Job search marked active" : "Job search paused", userId, "USER", session);
      }));
      return feedback(path, "Job search preference saved.", "success");
    }
    return new Response(null, { status: 404 });
  } catch (error) {
    if (action === "register" && error instanceof MongoServerError && error.code === 11000) {
      return feedback(path, "An account already uses this email. Sign in or request a reset.", "error");
    }
    console.error("NextRole operation failed", { action, type: error instanceof Error ? error.name : "unknown" });
    return feedback(paths[action], "Workspace storage or a required service is unavailable. Try again shortly.", "error");
  }
}
