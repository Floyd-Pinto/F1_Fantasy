-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LeagueType" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "RaceStatus" AS ENUM ('SCHEDULED', 'ONGOING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "email" VARCHAR(120) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "phone_no" VARCHAR(15) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" "Role" NOT NULL DEFAULT 'USER',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "League" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" CHAR(6) NOT NULL,
    "ownerId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "league_type" "LeagueType" NOT NULL DEFAULT 'PRIVATE',

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueMember" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "number" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "externalId" VARCHAR(64),
    "code" VARCHAR(3),
    "nationality" VARCHAR(50),
    "headshotUrl" VARCHAR(500),
    "wikiUrl" VARCHAR(300),
    "wins" INTEGER NOT NULL DEFAULT 0,
    "championshipPosition" INTEGER,
    "constructorId" INTEGER,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Constructor" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "externalId" VARCHAR(64),
    "nationality" VARCHAR(50),
    "teamPrincipal" VARCHAR(100),
    "color" VARCHAR(6),
    "logoUrl" VARCHAR(500),
    "wins" INTEGER NOT NULL DEFAULT 0,
    "championshipPosition" INTEGER,

    CONSTRAINT "Constructor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Race" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "circuit" VARCHAR(100),
    "raceDate" DATE NOT NULL,
    "season" INTEGER NOT NULL,
    "raceStart" TIMESTAMP(3) NOT NULL,
    "raceEnd" TIMESTAMP(3),
    "round" INTEGER,
    "country" VARCHAR(100),
    "locality" VARCHAR(100),
    "totalLaps" INTEGER,
    "openf1SessionKey" INTEGER,
    "status" "RaceStatus" NOT NULL DEFAULT 'SCHEDULED',

    CONSTRAINT "Race_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaceReplay" (
    "raceId" INTEGER NOT NULL,
    "frames" JSONB NOT NULL,
    "totalLaps" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaceReplay_pkey" PRIMARY KEY ("raceId")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "raceId" INTEGER NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "constructorId" INTEGER,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "driverId" INTEGER NOT NULL,
    "predictedPosition" INTEGER,
    "predictedDNF" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaceResult" (
    "id" SERIAL NOT NULL,
    "raceId" INTEGER NOT NULL,
    "driverId" INTEGER NOT NULL,
    "finishPosition" INTEGER,
    "dnf" BOOLEAN NOT NULL DEFAULT false,
    "fastestLap" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RaceResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Points" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "raceId" INTEGER NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "totalPts" INTEGER NOT NULL DEFAULT 0,
    "breakdown" JSONB,

    CONSTRAINT "Points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_no_key" ON "User"("phone_no");

-- CreateIndex
CREATE UNIQUE INDEX "League_code_key" ON "League"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueMember_leagueId_userId_key" ON "LeagueMember"("leagueId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_externalId_key" ON "Driver"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Constructor_externalId_key" ON "Constructor"("externalId");

-- CreateIndex
CREATE INDEX "Race_season_raceDate_idx" ON "Race"("season", "raceDate");

-- CreateIndex
CREATE UNIQUE INDEX "Race_season_round_key" ON "Race"("season", "round");

-- CreateIndex
CREATE UNIQUE INDEX "Team_userId_raceId_leagueId_key" ON "Team"("userId", "raceId", "leagueId");

-- CreateIndex
CREATE INDEX "Prediction_teamId_idx" ON "Prediction"("teamId");

-- CreateIndex
CREATE INDEX "Prediction_driverId_idx" ON "Prediction"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "Prediction_teamId_driverId_key" ON "Prediction"("teamId", "driverId");

-- CreateIndex
CREATE INDEX "RaceResult_raceId_idx" ON "RaceResult"("raceId");

-- CreateIndex
CREATE INDEX "RaceResult_driverId_idx" ON "RaceResult"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "RaceResult_raceId_driverId_key" ON "RaceResult"("raceId", "driverId");

-- CreateIndex
CREATE INDEX "Points_leagueId_idx" ON "Points"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "Points_userId_raceId_leagueId_key" ON "Points"("userId", "raceId", "leagueId");

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueMember" ADD CONSTRAINT "LeagueMember_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueMember" ADD CONSTRAINT "LeagueMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_constructorId_fkey" FOREIGN KEY ("constructorId") REFERENCES "Constructor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceReplay" ADD CONSTRAINT "RaceReplay_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_constructorId_fkey" FOREIGN KEY ("constructorId") REFERENCES "Constructor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceResult" ADD CONSTRAINT "RaceResult_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceResult" ADD CONSTRAINT "RaceResult_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Points" ADD CONSTRAINT "Points_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Points" ADD CONSTRAINT "Points_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Points" ADD CONSTRAINT "Points_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

