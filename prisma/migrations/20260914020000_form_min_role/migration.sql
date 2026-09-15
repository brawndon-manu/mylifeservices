-- who may see a form. null is every form that came before this, which is
-- everyone signed in. additive: no existing row changes behaviour.
ALTER TABLE "Form" ADD COLUMN "minRole" TEXT;
