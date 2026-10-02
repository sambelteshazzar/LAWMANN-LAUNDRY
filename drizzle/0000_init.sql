CREATE TYPE "public"."cost_category" AS ENUM('gas', 'electricity', 'water', 'detergent', 'wages', 'transport', 'rent', 'maintenance', 'other');--> statement-breakpoint
CREATE TYPE "public"."location_kind" AS ENUM('store', 'campus');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('received', 'washing', 'ready', 'collected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'momo');--> statement-breakpoint
CREATE TYPE "public"."payment_state" AS ENUM('pending_momo', 'confirmed', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('owner', 'counter', 'collector');--> statement-breakpoint
CREATE TABLE "band" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_grams" integer NOT NULL,
	"price_pesewa" bigint NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "location_kind" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "location_shop_name" UNIQUE("shop_id","name")
);
--> statement-breakpoint
CREATE TABLE "operating_cost" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"category" "cost_category" NOT NULL,
	"label" text,
	"amount_pesewa" bigint NOT NULL,
	"incurred_on" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"order_no" text NOT NULL,
	"location_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'received' NOT NULL,
	"weight_grams" integer NOT NULL,
	"method" text NOT NULL,
	"gross_pesewa" bigint NOT NULL,
	"base_pesewa" bigint NOT NULL,
	"vat_pesewa" bigint NOT NULL,
	"nhil_pesewa" bigint NOT NULL,
	"getfund_pesewa" bigint NOT NULL,
	"promised_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"collected_at" timestamp with time zone,
	"dormancy_flagged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_shop_no" UNIQUE("shop_id","order_no")
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"amount_pesewa" bigint NOT NULL,
	"method" "payment_method" NOT NULL,
	"state" "payment_state" DEFAULT 'confirmed' NOT NULL,
	"gateway_ref" text,
	"paid_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"float_pesewa" bigint NOT NULL,
	"counted_pesewa" bigint,
	"momo_at_open_pesewa" bigint,
	"momo_at_close_pesewa" bigint
);
--> statement-breakpoint
CREATE TABLE "shop" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"momo_number" text
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" "staff_role" NOT NULL,
	CONSTRAINT "staff_shop_name" UNIQUE("shop_id","name")
);
--> statement-breakpoint
CREATE TABLE "student" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"room" text,
	CONSTRAINT "student_shop_phone" UNIQUE("shop_id","phone")
);
--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operating_cost" ADD CONSTRAINT "operating_cost_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operating_cost_period" ON "operating_cost" USING btree ("shop_id","incurred_on");--> statement-breakpoint
CREATE INDEX "orders_status" ON "orders" USING btree ("shop_id","status");--> statement-breakpoint
CREATE INDEX "orders_open" ON "orders" USING btree ("shop_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_student" ON "orders" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_order" ON "payment" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_paid_at" ON "payment" USING btree ("paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_gateway_ref" ON "payment" USING btree ("gateway_ref");