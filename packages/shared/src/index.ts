// Types and schemas shared by the web client and the server.

export type HealthResponse = {
  ok: true;
  engineVersion: string;
};

export function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as HealthResponse).ok === true &&
    typeof (value as HealthResponse).engineVersion === "string"
  );
}
