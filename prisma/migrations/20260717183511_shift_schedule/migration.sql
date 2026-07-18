-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('FIXED', 'ROTATING', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('SCHEDULED', 'SWAPPED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Shift" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ShiftType" NOT NULL DEFAULT 'FIXED',
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "gracePeriodMins" INTEGER NOT NULL DEFAULT 10,
    "isOvernight" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleAssignment" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Shift_companyId_idx" ON "Shift"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_companyId_name_key" ON "Shift"("companyId", "name");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_shiftId_date_idx" ON "ScheduleAssignment"("shiftId", "date");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_employeeId_date_idx" ON "ScheduleAssignment"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleAssignment_employeeId_date_key" ON "ScheduleAssignment"("employeeId", "date");

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
