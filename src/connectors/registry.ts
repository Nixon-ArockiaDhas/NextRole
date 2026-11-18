export type PortalCapability = "external" | "unavailable" | "authorized";

export interface PortalConnector {
  id: string;
  name: string;
  initials: string;
  color: string;
  url: string;
  capabilities: {
    authentication: PortalCapability;
    search: PortalCapability;
    submission: PortalCapability;
    recruiterResponses: PortalCapability;
  };
}

const externalPortal = {
  authentication: "unavailable", search: "external", submission: "external", recruiterResponses: "unavailable",
} as const;

const oauthPortal = { ...externalPortal, authentication: "authorized" } as const;

export const connectors: readonly PortalConnector[] = [
  { id: "linkedin", name: "LinkedIn", initials: "in", color: "#0a66c2", url: "https://www.linkedin.com/jobs/", capabilities: oauthPortal },
  { id: "naukri", name: "Naukri", initials: "N", color: "#275df5", url: "https://www.naukri.com/", capabilities: externalPortal },
  { id: "indeed", name: "Indeed", initials: "i", color: "#2557a7", url: "https://in.indeed.com/", capabilities: oauthPortal },
  { id: "glassdoor", name: "Glassdoor", initials: "G", color: "#078550", url: "https://www.glassdoor.co.in/Job/", capabilities: externalPortal },
  { id: "monster", name: "Monster Jobs", initials: "M", color: "#5c33a0", url: "https://www.monster.com/", capabilities: externalPortal },
];
