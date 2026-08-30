import { beforeEach, describe, expect, mock, test } from "bun:test";

const findFirst = mock(async (_query: unknown): Promise<Record<string, unknown> | null> => ({
  id: 17,
  conditions: [],
}));
const openRouterAi = mock(async () => "{}");

const conditionStart = new Date("2026-08-01T00:00:00.000Z");
const conditionEnd = new Date("2026-08-15T00:00:00.000Z");
const conditionRecord = () => ({
  id: 31,
  hospitalId: 9,
  startDate: conditionStart,
  endDate: conditionEnd as Date | null,
  hospital: { perDayPatientCost: 100 },
});

const patientConditionFindUnique = mock(async (_query: unknown) => conditionRecord());
const patientConditionFindFirst = mock(async (_query: unknown) => conditionRecord());
const patientConditionUpdateMany = mock(async (_query: unknown) => ({ count: 1 }));
const patientProgressCreateMany = mock(async (query: any) => ({
  count: query.data.length,
}));
const medicineAllottedCreate = mock(async (_query: unknown) => ({ id: 71 }));
const hospitalUpdateMany = mock(async (_query: unknown) => ({ count: 1 }));
const hospitalFindUnique = mock(async (_query: unknown) => ({ balance: 75_000 }));

const prismaMock: any = {
  patient: { findFirst },
  patientCondition: {
    findUnique: patientConditionFindUnique,
    findFirst: patientConditionFindFirst,
    updateMany: patientConditionUpdateMany,
  },
  patientProgress: { createMany: patientProgressCreateMany },
  medicineAllotted: { create: medicineAllottedCreate },
  hospital: {
    updateMany: hospitalUpdateMany,
    findUnique: hospitalFindUnique,
  },
};
const transaction = mock(async (callback: (tx: any) => unknown) =>
  callback(prismaMock),
);
prismaMock.$transaction = transaction;

mock.module("../../config/prisma", () => ({
  default: prismaMock,
}));
mock.module("../../utils/openrouter_ai", () => ({ default: openRouterAi }));

const {
  AssignMedicine,
  CreatePatientProgress,
  ExtendPatientCondition,
  GetFullPatientProfile,
  GetPatientSummary,
  SearchPatientByMobile,
} = await import("./patient.service");
const { CreateprogressSchema } = await import("./patient.schema");

beforeEach(() => {
  findFirst.mockClear();
  findFirst.mockResolvedValue({ id: 17, conditions: [] });
  openRouterAi.mockClear();
  patientConditionFindUnique.mockClear();
  patientConditionFindUnique.mockResolvedValue(conditionRecord());
  patientConditionFindFirst.mockClear();
  patientConditionFindFirst.mockResolvedValue(conditionRecord());
  patientConditionUpdateMany.mockClear();
  patientConditionUpdateMany.mockResolvedValue({ count: 1 });
  patientProgressCreateMany.mockClear();
  patientProgressCreateMany.mockImplementation(async (query: any) => ({
    count: query.data.length,
  }));
  medicineAllottedCreate.mockClear();
  medicineAllottedCreate.mockResolvedValue({ id: 71 });
  hospitalUpdateMany.mockClear();
  hospitalUpdateMany.mockResolvedValue({ count: 1 });
  hospitalFindUnique.mockClear();
  hospitalFindUnique.mockResolvedValue({ balance: 75_000 });
  transaction.mockClear();
  transaction.mockImplementation(async (callback: (tx: any) => unknown) =>
    callback(prismaMock),
  );
});

describe("hospital-scoped patient profile reads", () => {

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

describe("condition paid-window enforcement", () => {
  test("allows progress whose final occurrence is on the inclusive end date", async () => {
    const result = await CreatePatientProgress({
      patientConditionId: 31,
      hospitalId: 9,
      frequency: 7,
      totalOccurrences: 3,
      questions: [{ question: "How are you?", isText: true }],
      startDate: new Date("2026-08-01T18:30:00.000Z"),
    });

    expect(result).toEqual({ count: 3 });
    const createdDates = patientProgressCreateMany.mock.calls[0]?.[0].data.map(
      (entry: any) => entry.scheduledDate.toISOString(),
    );
    expect(createdDates).toEqual([
      "2026-08-01T18:30:00.000Z",
      "2026-08-08T18:30:00.000Z",
      "2026-08-15T18:30:00.000Z",
    ]);
  });

  test("rejects progress whose final occurrence exceeds the condition end date", async () => {
    await expect(
      CreatePatientProgress({
        patientConditionId: 31,
        hospitalId: 9,
        frequency: 7,
        totalOccurrences: 4,
        questions: [{ question: "How are you?", isText: true }],
        startDate: new Date("2026-08-01T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ statusCode: 422 });

    expect(patientProgressCreateMany).not.toHaveBeenCalled();
  });

  test("rejects progress beginning before the condition start date", async () => {
    await expect(
      CreatePatientProgress({
        patientConditionId: 31,
        hospitalId: 9,
        frequency: 1,
        totalOccurrences: 1,
        questions: [{ question: "How are you?", isText: true }],
        startDate: new Date("2026-07-31T23:59:00.000Z"),
      }),
    ).rejects.toMatchObject({ statusCode: 422 });

    expect(patientProgressCreateMany).not.toHaveBeenCalled();
  });

  test("rejects invalid dates and fractional schedule values at the schema boundary", () => {
    expect(
      CreateprogressSchema.safeParse({
        patientConditionId: 31,
        frequency: 1.5,
        totalOccurrences: 2,
        questions: [],
        startDate: "not-a-date",
      }).success,
    ).toBe(false);

    expect(
      CreateprogressSchema.safeParse({
        patientConditionId: 31,
        frequency: 1,
        totalOccurrences: 1001,
        questions: [],
        startDate: "2026-08-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  test("allows a medicine through any time on the final paid day", async () => {
    await AssignMedicine(
      {
        patientConditionId: 31,
        medicines: [
          {
            medicineId: 5,
            quantity: 1,
            tillDate: new Date("2026-08-15T23:59:59.999Z"),
            timings: ["08:00"],
          },
        ],
      },
      { id: 9, role: "Hospital" },
    );

    expect(medicineAllottedCreate).toHaveBeenCalledTimes(1);
  });

  test("rejects the entire medicine batch when one till date exceeds the window", async () => {
    await expect(
      AssignMedicine(
        {
          patientConditionId: 31,
          medicines: [
            {
              medicineId: 5,
              quantity: 1,
              tillDate: new Date("2026-08-15T00:00:00.000Z"),
              timings: ["08:00"],
            },
            {
              medicineId: 6,
              quantity: 1,
              tillDate: new Date("2026-08-16T00:00:00.000Z"),
              timings: ["20:00"],
            },
          ],
        },
        { id: 9, role: "Hospital" },
      ),
    ).rejects.toMatchObject({ statusCode: 422 });

    expect(medicineAllottedCreate).not.toHaveBeenCalled();
  });

  test("limits a legacy open-ended condition to its originally billed start day", async () => {
    patientConditionFindUnique.mockResolvedValueOnce({
      ...conditionRecord(),
      endDate: null,
    });

    await expect(
      AssignMedicine(
        {
          patientConditionId: 31,
          medicines: [
            {
              medicineId: 5,
              quantity: 1,
              tillDate: new Date("2026-08-02T00:00:00.000Z"),
              timings: ["08:00"],
            },
          ],
        },
        { id: 9, role: "Hospital" },
      ),
    ).rejects.toMatchObject({ statusCode: 422 });

    expect(medicineAllottedCreate).not.toHaveBeenCalled();
  });
});

describe("condition paid-window extension", () => {
  test("charges only the additional days and moves the end date atomically", async () => {
    const newEndDate = new Date("2026-08-20T00:00:00.000Z");

    const result = await ExtendPatientCondition(
      { patientConditionId: 31, endDate: newEndDate },
      9,
    );

    expect(patientConditionUpdateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 31, hospitalId: 9, endDate: conditionEnd },
      data: { endDate: newEndDate },
    });
    expect(hospitalUpdateMany.mock.calls[0]?.[0]).toEqual({
      where: { id: 9, balance: { gte: 25_000 } },
      data: { balance: { decrement: 25_000 } },
    });
    expect(result.billing).toMatchObject({
      addedDays: 5,
      totalCost: 50_000,
      charged: 25_000,
      balance: 75_000,
    });
  });

  test("rejects an extension when the wallet cannot cover the added days", async () => {
    hospitalUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      ExtendPatientCondition(
        {
          patientConditionId: 31,
          endDate: new Date("2026-08-20T00:00:00.000Z"),
        },
        9,
      ),
    ).rejects.toMatchObject({ statusCode: 402 });

    expect(hospitalFindUnique).not.toHaveBeenCalled();
  });

  test("does not charge when another request has already changed the end date", async () => {
    patientConditionUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      ExtendPatientCondition(
        {
          patientConditionId: 31,
          endDate: new Date("2026-08-20T00:00:00.000Z"),
        },
        9,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(hospitalUpdateMany).not.toHaveBeenCalled();
  });

  test("extends a legacy open-ended condition from its paid start day", async () => {
    patientConditionFindUnique.mockResolvedValueOnce({
      ...conditionRecord(),
      endDate: null,
    });

    const result = await ExtendPatientCondition(
      {
        patientConditionId: 31,
        endDate: new Date("2026-08-03T00:00:00.000Z"),
      },
      9,
    );

    expect(patientConditionUpdateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 31, hospitalId: 9, endDate: null },
    });
    expect(result.billing).toMatchObject({
      addedDays: 2,
      totalCost: 20_000,
      charged: 10_000,
    });
  });
});
