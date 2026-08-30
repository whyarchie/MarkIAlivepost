import { describe, expect, mock, test } from "bun:test";
import jwt from "jsonwebtoken";
import { AuthUser, requireRole } from "./Auth";

function responseMock() {
  const json = mock(() => undefined);
  const status = mock(() => ({ json }));
  return { response: { status } as any, status, json };
}

describe("API authentication", () => {
  test("accepts an Android bearer token", () => {
    const token = jwt.sign(
      { id: 17, role: "Patient" },
      process.env.JWT_SECRET!,
      { algorithm: "HS256" },
    );
    const request = {
      cookies: {},
      get: (name: string) => name === "authorization" ? `Bearer ${token}` : undefined,
    } as any;
    const next = mock(() => undefined);

    AuthUser(request, responseMock().response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(request.user).toEqual({ id: 17, role: "Patient", iat: expect.any(Number) });
  });

  test("retains cookie authentication for the hospital dashboard", () => {
    const token = jwt.sign(
      { id: 9, role: "Hospital" },
      process.env.JWT_SECRET!,
      { algorithm: "HS256" },
    );
    const request = { cookies: { token }, get: () => undefined } as any;
    const next = mock(() => undefined);

    AuthUser(request, responseMock().response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(request.user.role).toBe("Hospital");
  });

  test("returns 401 when neither credential is present", () => {
    const request = { cookies: {}, get: () => undefined } as any;
    const { response, status, json } = responseMock();
    const next = mock(() => undefined);

    AuthUser(request, response, next);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ msg: "No authentication token provided" });
    expect(next).not.toHaveBeenCalled();
  });

  test("role guard blocks a patient from hospital routes", () => {
    const request = { user: { id: 17, role: "Patient" } } as any;
    const next = mock((_error?: unknown) => undefined);

    requireRole("Hospital")(request, {} as any, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 403 });
  });
});
