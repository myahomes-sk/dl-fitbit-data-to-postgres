# PRD: Fitbit Data to Supabase Migration

## Introduction

The goal of this project is to take Fitbit personal export data, which consists of numerous CSV and TXT files organized in directories (such as "Heart Rate" and "Sleep"), and migrate it into a Supabase database. This will allow for robust SQL querying, analytics, and integration of the user's Fitbit activity data into external platforms.

Because the dataset is large, we are following the Ralph methodology: breaking the work into extremely small, independent chunks that can be consumed by an autonomous agent in a single session.

## Goals

- Establish a Supabase connection and scripting environment (Node.js/Python).
- Create robust, well-defined Supabase tables for the primary data sources starting with Sleep and Heart Rate Alerts.
- Enable secure ingestion of this data via scripts.
- Prioritize small iterative stories over an instantaneous complete migration.

## User Stories

### US-001: Set up migration script environment
**Description:** As a developer, I want to initialize the local scripting environment so I can write code to parse CSVs and upload to Supabase.

**Acceptance Criteria:**
- [ ] Initialize project (e.g. Node.js with package.json or Python with requirements.txt).
- [ ] Install Supabase client, CSV parsing tools, and environment variable loader (dotenv).
- [ ] Set up basic script that authenticates with Supabase using `.env`.
- [ ] Typecheck passes.

### US-002: Create schema for Heart Rate Alerts
**Description:** As a data engineer, I want to create the schema in Supabase for "Heart Rate Notifications Alerts.csv".

**Acceptance Criteria:**
- [ ] Create `heart_rate_alerts` table in Supabase via DDL script or Supabase CLI.
- [ ] Table includes columns: `id`, `start_timestamp` (timestamptz), `end_timestamp` (timestamptz), `type` (text), `threshold` (int), `value` (int).
- [ ] Script or migration confirms the table exists.
- [ ] Typecheck passes.

### US-003: Migrate Heart Rate Alerts data
**Description:** As a data engineer, I want to execute a script that reads "Heart Rate Notifications Alerts.csv" and inserts it into Supabase.

**Acceptance Criteria:**
- [ ] Script successfully parses `Heart Rate/Heart Rate Notifications Alerts.csv`. 
- [ ] Each row is inserted into `heart_rate_alerts`, ignoring or upserting duplicates based on `id`.
- [ ] Validated with test run that data appears in Supabase.
- [ ] Typecheck passes.

### US-004: Create schema for Sleep Profile
**Description:** As a developer, I want to define the schema for "Sleep Profile.csv" to securely store my sleep consistency records.

**Acceptance Criteria:**
- [ ] Create `sleep_profiles` table via DDL script or migration.
- [ ] Include columns matching CSV: `creation_date` (date/text), `sleep_type` (text), `deep_sleep` (float/numeric), `rem_sleep` (float/numeric), etc.
- [ ] Typecheck passes.

### US-005: Migrate Sleep Profile data
**Description:** As a developer, I want to script the insertion of 'Sleep Profile.csv' data into the Supabase 'sleep_profiles' table.

**Acceptance Criteria:**
- [ ] Script successfully parses `Sleep/Sleep Profile.csv`.
- [ ] Float and numerical limits are correctly mapped and inserted matching the schema.
- [ ] Validated that tables contain real data.
- [ ] Typecheck passes.

## Functional Requirements

- FR-1: Environment initialization referencing `.env` with Supabase keys.
- FR-2: Explicit DDL schemas matching Fitbit CSV exports.
- FR-3: Scripts stream or parse large CSVs to prevent memory bloat.
- FR-4: Conflict handling during insertion (Idempotency).

## Non-Goals

- Front-end dashboards are NOT in scope for this run.
- Creating queries or aggregations in Supabase is out of scope.
- We will not automatically map ALL 30+ folders yet; we stick to Heart Rate and Sleep as a template.

## Success Criteria

- Supabase project contains `heart_rate_alerts` and `sleep_profiles` loaded with data matching the CSVs precisely.
- Ralph agent runs complete successfully with all automated quality checks passing.
