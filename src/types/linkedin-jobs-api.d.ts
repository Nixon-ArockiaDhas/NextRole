declare module "linkedin-jobs-api" {
  export function query(options: { keyword: string; location: string; limit: string }): Promise<unknown>;
}
