// Carries the HTTP status the API answers with
export class CampaignError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
