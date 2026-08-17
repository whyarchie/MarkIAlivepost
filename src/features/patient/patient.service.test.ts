import { beforeEach, describe, expect, mock, test } from "bun:test";

const findFirst = mock(async (_query: unknown): Promise<Record<string, unknown> | null> => ({
  id: 17,
  conditions: [],
}));
const openRouterAi = mock(async () => "{}");

mock.module("../../config/prisma", () => ({
  default: {
    patient: { findFirst },
  },
}));
mock.module("../../utils/openrouter_ai", () => ({ default: openRouterAi }));

const { GetFullPatientProfile, GetPatientSummary, SearchPatientByMobile } = await import("./patient.service");

describe("hospital-scoped patient profile reads", () => {
  beforeEach(() => {
    findFirst.mockClear();
    findFirst.mockResolvedValue({ id: 17, conditions: [] });
    openRouterAi.mockClear();
  });

  test("requires hospital enrollment and scopes returned conditions", async () => {
    await GetFullPatientProfile({ patientId: 17, hospitalId: 9 });

    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: {
        id: 17,
        conditions: { some: { hospitalId: 9 } },
      },
      include: {
        conditions: { where: { hospitalId: 9 } },
      },
    });
  });

  test("normalizes mobile numbers through the secured hospital search", async () => {
    await SearchPatientByMobile("+91 98765 43210", 9);

    expect(findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: {
        mobileNumber: "9876543210",
        conditions: { some: { hospitalId: 9 } },
      },
    });
  });

  test("does not return a patient outside the hospital's care", async () => {
    findFirst.mockResolvedValueOnce(null);

    await expect(
      GetFullPatientProfile({ patientId: 17, hospitalId: 9 })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test("applies the same ownership check before generating an AI summary", async () => {
    await GetPatientSummary(17, 9);

    expect(findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: {
        id: 17,
        conditions: { some: { hospitalId: 9 } },
      },
    });
    expect(openRouterAi).toHaveBeenCalledTimes(1);
  });
});
