-- CreateTable
CREATE TABLE "HospitalAiOverview" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalAiOverview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HospitalAiOverview_hospitalId_key" ON "HospitalAiOverview"("hospitalId");

-- AddForeignKey
ALTER TABLE "HospitalAiOverview" ADD CONSTRAINT "HospitalAiOverview_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
