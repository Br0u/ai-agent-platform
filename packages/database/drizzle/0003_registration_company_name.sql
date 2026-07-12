ALTER TABLE "customer_registrations" ADD COLUMN "company_name" varchar(240) DEFAULT '__aap_legacy_missing_company_name_v1__' NOT NULL;
ALTER TABLE "customer_registrations" ALTER COLUMN "company_name" DROP DEFAULT;
