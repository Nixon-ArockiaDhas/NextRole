import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import nodemailer from "nodemailer";
import { database, audit } from "./database";
import { digest, type Account } from "./accounts";

interface ResetToken { _id: string; userId: string; expiresAt: Date }

export async function sendReset(email: string) {
  if (!process.env.SMTP_URL || !process.env.MAIL_FROM || !process.env.APP_URL) return false;
  const { db } = await database();
  const account = await db.collection<Account>("users").findOne({ email });
  if (!account) return true;
  const token = randomBytes(32).toString("base64url");
  const url = new URL("/reset", process.env.APP_URL);
  url.searchParams.set("token", token);
  const tokens = db.collection<ResetToken>("resetTokens");
  await tokens.insertOne({ _id: digest(token), userId: account._id, expiresAt: new Date(Date.now() + 30 * 60_000) });
  try {
    await nodemailer.createTransport(process.env.SMTP_URL).sendMail({
      from: process.env.MAIL_FROM, to: account.email, subject: "Reset your NextRole password",
      text: `Open this link within 30 minutes to reset your password: ${url.href}`,
    });
  } catch {
    await tokens.deleteOne({ _id: digest(token) });
    console.error("NextRole reset email delivery failed.");
  }
  return true;
}

export async function resetPassword(token: string, password: string) {
  const { client, db } = await database();
  const passwordHash = await hash(password, 12);
  return client.withSession((session) => session.withTransaction(async () => {
    const item = await db.collection<ResetToken>("resetTokens").findOneAndDelete({
      _id: digest(token), expiresAt: { $gt: new Date() },
    }, { session });
    if (!item) return false;
    await db.collection<Account>("users").updateOne({ _id: item.userId }, { $set: { passwordHash } }, { session });
    await db.collection("sessions").deleteMany({ userId: item.userId }, { session });
    await db.collection("resetTokens").deleteMany({ userId: item.userId }, { session });
    await audit(item.userId, "Password reset", item.userId, "USER", session);
    return true;
  }));
}
