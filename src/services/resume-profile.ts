import type { Field, Profile } from "./resumes";

const sections: Record<string, Field> = {
  summary: "summary", "professional summary": "summary", achievements: "achievements",
  languages: "languages", awards: "awards", publications: "publications",
  skills: "technicalSkills", "technical skills": "technicalSkills", "core skills": "technicalSkills",
  "core competencies": "technicalSkills", "soft skills": "softSkills",
  education: "education", certifications: "certifications", projects: "projects",
  experience: "pastRoles", "work experience": "pastRoles", "professional experience": "pastRoles",
  "employment history": "pastRoles", "career history": "pastRoles", "work history": "pastRoles",
};

const labels: Record<string, Field> = {
  name: "name", "full name": "name", "current role": "title", "current designation": "title",
  "job title": "title", "current company": "company", location: "location",
  portfolio: "portfolio", "total experience": "experience", "years of experience": "experience",
  "relevant experience": "relevantExperience", "industry experience": "industries",
};

export function profileFromResumeText(text: string): Profile {
  const fields: Profile = {};
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = lines.slice(0, 8).join("\n");
  fields.email = header.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  fields.linkedin = header.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w%-]+\/?/i)?.[0];
  const indianPhone = header.match(/(?:\+91[ .-]?)?[6-9]\d{4}[ .-]?\d{5}(?!\d)/)?.[0];
  if (indianPhone) fields.phone = indianPhone;
  const headline = lines.slice(0, 6).find(line => /\b(designer|developer|engineer|manager|analyst|architect|consultant)\b/i.test(line) && line.length < 140 && !/[@•]|\b(summary|experience)\b/i.test(line));
  if (headline) fields.title = headline;
  const phone = header.match(/(?:^|[\s|:])((?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)|\d{2,5})[ .-]?\d{3,5}[ .-]?\d{4})(?=$|[\s|;,])/m)?.[1];
  if (!fields.phone && phone && phone.replace(/\D/g, "").length <= 15) fields.phone = phone;

  const first = lines.find((line) => !/^(resume|curriculum vitae|cv)$/i.test(line));
  if (first && first.length <= 80 && /^\p{L}[\p{L}\p{M}.'’-]*(?: +\p{L}[\p{L}\p{M}.'’-]*){1,4}$/u.test(first)
    && !/\b(engineer|designer|developer|manager|analyst|consultant|specialist|profile|summary|architect|experience|director|lead|scientist|student|recruiter)\b/i.test(first)
    && !Object.hasOwn(sections, first.toLowerCase())) {
    fields.name = first;
  }

  let section: Field | undefined;
  for (const line of lines) {
    const [heading, ...rest] = line.split(":");
    const key = heading.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (value && Object.hasOwn(labels, key)) {
      fields[labels[key]] = value;
      continue;
    }
    if (Object.hasOwn(sections, key)) {
      section = sections[key];
      if (!value) continue;
    } else if (/^(summary|profile|professional summary|objective|contact|languages|interests|references|awards|volunteering):?$/i.test(line)
      || (/^[\p{Lu} ]{4,45}$/u.test(line) && !section?.endsWith("Skills"))) {
      section = undefined;
      continue;
    }
    if (section) {
      const item = (Object.hasOwn(sections, key) ? value : line).replace(/^[•●▪*-]\s*/, "");
      const separator = section.endsWith("Skills") ? ", " : " | ";
      fields[section] = [fields[section], item].filter(Boolean).join(separator).slice(0, 2000);
    }
  }

  return Object.fromEntries(Object.entries(fields).flatMap(([key, value]) =>
    value?.trim() ? [[key, value.trim().slice(0, 2000)]] : []));
}
