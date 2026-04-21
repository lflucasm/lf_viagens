-- Datas de viagem por venda
ALTER TABLE "sales"
ADD COLUMN "departureDate" TIMESTAMP(3),
ADD COLUMN "returnDate" TIMESTAMP(3);
