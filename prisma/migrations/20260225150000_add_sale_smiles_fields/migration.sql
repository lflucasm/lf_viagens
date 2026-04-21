-- Campos adicionais para vendas Smiles
ALTER TABLE "sales"
ADD COLUMN "firstPassengerLastName" TEXT,
ADD COLUMN "departureAirportIata" TEXT;
