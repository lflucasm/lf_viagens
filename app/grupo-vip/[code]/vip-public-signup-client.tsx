"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type PublicInfoResponse = {
  ok?: boolean;
  error?: string;
  data?: {
    code: string;
    employee: { id: string; name: string; login: string };
    pricing: { firstMonthCents: number; recurringMonthCents: number };
    pix: { key: string; label: string };
  };
};

type RegisterResponse = {
  ok?: boolean;
  error?: string;
  data?: {
    lead: { id: string; status: string; createdAt: string; fullName: string };
    employee: { id: string; name: string; login: string };
    employeeWhatsappUrl: string;
    employeeWhatsappMessage: string;
    pix: { key: string; label: string };
    pricing: { firstMonthCents: number; recurringMonthCents: number };
  };
};

type FormState = {
  fullName: string;
  birthDate: string;
  countryCode: string;
  areaCode: string;
  phoneNumber: string;
  originAirport: string;
  destinationAirport1: string;
  destinationAirport2: string;
  destinationAirport3: string;
};

const COUNTRY_OPTIONS = [
  { value: "1", label: "Estados Unidos/Canadá (+1)" },
  { value: "7", label: "Rússia/Cazaquistão (+7)" },
  { value: "20", label: "Egito (+20)" },
  { value: "27", label: "África do Sul (+27)" },
  { value: "30", label: "Grécia (+30)" },
  { value: "31", label: "Países Baixos (+31)" },
  { value: "32", label: "Bélgica (+32)" },
  { value: "33", label: "França (+33)" },
  { value: "34", label: "Espanha (+34)" },
  { value: "36", label: "Hungria (+36)" },
  { value: "39", label: "Itália (+39)" },
  { value: "40", label: "Romênia (+40)" },
  { value: "41", label: "Suíça (+41)" },
  { value: "43", label: "Áustria (+43)" },
  { value: "44", label: "Reino Unido (+44)" },
  { value: "45", label: "Dinamarca (+45)" },
  { value: "46", label: "Suécia (+46)" },
  { value: "47", label: "Noruega (+47)" },
  { value: "48", label: "Polônia (+48)" },
  { value: "49", label: "Alemanha (+49)" },
  { value: "51", label: "Peru (+51)" },
  { value: "52", label: "México (+52)" },
  { value: "53", label: "Cuba (+53)" },
  { value: "54", label: "Argentina (+54)" },
  { value: "55", label: "Brasil (+55)" },
  { value: "56", label: "Chile (+56)" },
  { value: "57", label: "Colômbia (+57)" },
  { value: "58", label: "Venezuela (+58)" },
  { value: "60", label: "Malásia (+60)" },
  { value: "61", label: "Austrália (+61)" },
  { value: "62", label: "Indonésia (+62)" },
  { value: "63", label: "Filipinas (+63)" },
  { value: "64", label: "Nova Zelândia (+64)" },
  { value: "65", label: "Singapura (+65)" },
  { value: "66", label: "Tailândia (+66)" },
  { value: "81", label: "Japão (+81)" },
  { value: "82", label: "Coreia do Sul (+82)" },
  { value: "84", label: "Vietnã (+84)" },
  { value: "86", label: "China (+86)" },
  { value: "90", label: "Turquia (+90)" },
  { value: "91", label: "Índia (+91)" },
  { value: "92", label: "Paquistão (+92)" },
  { value: "93", label: "Afeganistão (+93)" },
  { value: "94", label: "Sri Lanka (+94)" },
  { value: "95", label: "Myanmar (+95)" },
  { value: "98", label: "Irã (+98)" },
  { value: "211", label: "Sudão do Sul (+211)" },
  { value: "212", label: "Marrocos (+212)" },
  { value: "213", label: "Argélia (+213)" },
  { value: "216", label: "Tunísia (+216)" },
  { value: "218", label: "Líbia (+218)" },
  { value: "220", label: "Gâmbia (+220)" },
  { value: "221", label: "Senegal (+221)" },
  { value: "222", label: "Mauritânia (+222)" },
  { value: "223", label: "Mali (+223)" },
  { value: "224", label: "Guiné (+224)" },
  { value: "225", label: "Costa do Marfim (+225)" },
  { value: "226", label: "Burkina Faso (+226)" },
  { value: "227", label: "Níger (+227)" },
  { value: "228", label: "Togo (+228)" },
  { value: "229", label: "Benim (+229)" },
  { value: "230", label: "Maurício (+230)" },
  { value: "231", label: "Libéria (+231)" },
  { value: "232", label: "Serra Leoa (+232)" },
  { value: "233", label: "Gana (+233)" },
  { value: "234", label: "Nigéria (+234)" },
  { value: "235", label: "Chade (+235)" },
  { value: "236", label: "Rep. Centro-Africana (+236)" },
  { value: "237", label: "Camarões (+237)" },
  { value: "238", label: "Cabo Verde (+238)" },
  { value: "239", label: "São Tomé e Príncipe (+239)" },
  { value: "240", label: "Guiné Equatorial (+240)" },
  { value: "241", label: "Gabão (+241)" },
  { value: "242", label: "Rep. do Congo (+242)" },
  { value: "243", label: "RD Congo (+243)" },
  { value: "244", label: "Angola (+244)" },
  { value: "245", label: "Guiné-Bissau (+245)" },
  { value: "246", label: "Território Britânico Índico (+246)" },
  { value: "248", label: "Seicheles (+248)" },
  { value: "249", label: "Sudão (+249)" },
  { value: "250", label: "Ruanda (+250)" },
  { value: "251", label: "Etiópia (+251)" },
  { value: "252", label: "Somália (+252)" },
  { value: "253", label: "Djibuti (+253)" },
  { value: "254", label: "Quênia (+254)" },
  { value: "255", label: "Tanzânia (+255)" },
  { value: "256", label: "Uganda (+256)" },
  { value: "257", label: "Burundi (+257)" },
  { value: "258", label: "Moçambique (+258)" },
  { value: "260", label: "Zâmbia (+260)" },
  { value: "261", label: "Madagascar (+261)" },
  { value: "262", label: "Reunião/Mayotte (+262)" },
  { value: "263", label: "Zimbábue (+263)" },
  { value: "264", label: "Namíbia (+264)" },
  { value: "265", label: "Malawi (+265)" },
  { value: "266", label: "Lesoto (+266)" },
  { value: "267", label: "Botsuana (+267)" },
  { value: "268", label: "Essuatíni (+268)" },
  { value: "269", label: "Comores (+269)" },
  { value: "290", label: "Santa Helena (+290)" },
  { value: "291", label: "Eritreia (+291)" },
  { value: "297", label: "Aruba (+297)" },
  { value: "298", label: "Ilhas Faroé (+298)" },
  { value: "299", label: "Groenlândia (+299)" },
  { value: "350", label: "Gibraltar (+350)" },
  { value: "351", label: "Portugal (+351)" },
  { value: "352", label: "Luxemburgo (+352)" },
  { value: "353", label: "Irlanda (+353)" },
  { value: "354", label: "Islândia (+354)" },
  { value: "355", label: "Albânia (+355)" },
  { value: "356", label: "Malta (+356)" },
  { value: "357", label: "Chipre (+357)" },
  { value: "358", label: "Finlândia (+358)" },
  { value: "359", label: "Bulgária (+359)" },
  { value: "370", label: "Lituânia (+370)" },
  { value: "371", label: "Letônia (+371)" },
  { value: "372", label: "Estônia (+372)" },
  { value: "373", label: "Moldávia (+373)" },
  { value: "374", label: "Armênia (+374)" },
  { value: "375", label: "Belarus (+375)" },
  { value: "376", label: "Andorra (+376)" },
  { value: "377", label: "Mônaco (+377)" },
  { value: "378", label: "San Marino (+378)" },
  { value: "380", label: "Ucrânia (+380)" },
  { value: "381", label: "Sérvia (+381)" },
  { value: "382", label: "Montenegro (+382)" },
  { value: "383", label: "Kosovo (+383)" },
  { value: "385", label: "Croácia (+385)" },
  { value: "386", label: "Eslovênia (+386)" },
  { value: "387", label: "Bósnia e Herzegovina (+387)" },
  { value: "389", label: "Macedônia do Norte (+389)" },
  { value: "420", label: "República Tcheca (+420)" },
  { value: "421", label: "Eslováquia (+421)" },
  { value: "423", label: "Liechtenstein (+423)" },
  { value: "500", label: "Ilhas Malvinas (+500)" },
  { value: "501", label: "Belize (+501)" },
  { value: "502", label: "Guatemala (+502)" },
  { value: "503", label: "El Salvador (+503)" },
  { value: "504", label: "Honduras (+504)" },
  { value: "505", label: "Nicarágua (+505)" },
  { value: "506", label: "Costa Rica (+506)" },
  { value: "507", label: "Panamá (+507)" },
  { value: "508", label: "Saint Pierre e Miquelon (+508)" },
  { value: "509", label: "Haiti (+509)" },
  { value: "590", label: "Guadalupe (+590)" },
  { value: "591", label: "Bolívia (+591)" },
  { value: "592", label: "Guiana (+592)" },
  { value: "593", label: "Equador (+593)" },
  { value: "594", label: "Guiana Francesa (+594)" },
  { value: "595", label: "Paraguai (+595)" },
  { value: "596", label: "Martinica (+596)" },
  { value: "597", label: "Suriname (+597)" },
  { value: "598", label: "Uruguai (+598)" },
  { value: "599", label: "Curaçao (+599)" },
  { value: "670", label: "Timor-Leste (+670)" },
  { value: "672", label: "Territórios Australianos (+672)" },
  { value: "673", label: "Brunei (+673)" },
  { value: "674", label: "Nauru (+674)" },
  { value: "675", label: "Papua-Nova Guiné (+675)" },
  { value: "676", label: "Tonga (+676)" },
  { value: "677", label: "Ilhas Salomão (+677)" },
  { value: "678", label: "Vanuatu (+678)" },
  { value: "679", label: "Fiji (+679)" },
  { value: "680", label: "Palau (+680)" },
  { value: "681", label: "Wallis e Futuna (+681)" },
  { value: "682", label: "Ilhas Cook (+682)" },
  { value: "683", label: "Niue (+683)" },
  { value: "685", label: "Samoa (+685)" },
  { value: "686", label: "Kiribati (+686)" },
  { value: "687", label: "Nova Caledônia (+687)" },
  { value: "688", label: "Tuvalu (+688)" },
  { value: "689", label: "Polinésia Francesa (+689)" },
  { value: "690", label: "Toquelau (+690)" },
  { value: "691", label: "Micronésia (+691)" },
  { value: "692", label: "Ilhas Marshall (+692)" },
  { value: "850", label: "Coreia do Norte (+850)" },
  { value: "852", label: "Hong Kong (+852)" },
  { value: "853", label: "Macau (+853)" },
  { value: "855", label: "Camboja (+855)" },
  { value: "856", label: "Laos (+856)" },
  { value: "880", label: "Bangladesh (+880)" },
  { value: "886", label: "Taiwan (+886)" },
  { value: "960", label: "Maldivas (+960)" },
  { value: "961", label: "Líbano (+961)" },
  { value: "962", label: "Jordânia (+962)" },
  { value: "963", label: "Síria (+963)" },
  { value: "964", label: "Iraque (+964)" },
  { value: "965", label: "Kuwait (+965)" },
  { value: "966", label: "Arábia Saudita (+966)" },
  { value: "967", label: "Iêmen (+967)" },
  { value: "968", label: "Omã (+968)" },
  { value: "970", label: "Palestina (+970)" },
  { value: "971", label: "Emirados Árabes Unidos (+971)" },
  { value: "972", label: "Israel (+972)" },
  { value: "973", label: "Bahrein (+973)" },
  { value: "974", label: "Catar (+974)" },
  { value: "975", label: "Butão (+975)" },
  { value: "976", label: "Mongólia (+976)" },
  { value: "977", label: "Nepal (+977)" },
  { value: "992", label: "Tajiquistão (+992)" },
  { value: "993", label: "Turcomenistão (+993)" },
  { value: "994", label: "Azerbaijão (+994)" },
  { value: "995", label: "Geórgia (+995)" },
  { value: "996", label: "Quirguistão (+996)" },
  { value: "998", label: "Uzbequistão (+998)" },
  { value: "1242", label: "Bahamas (+1242)" },
  { value: "1246", label: "Barbados (+1246)" },
  { value: "1264", label: "Anguilla (+1264)" },
  { value: "1268", label: "Antígua e Barbuda (+1268)" },
  { value: "1284", label: "Ilhas Virgens Britânicas (+1284)" },
  { value: "1340", label: "Ilhas Virgens EUA (+1340)" },
  { value: "1345", label: "Ilhas Cayman (+1345)" },
  { value: "1441", label: "Bermudas (+1441)" },
  { value: "1473", label: "Granada (+1473)" },
  { value: "1649", label: "Ilhas Turks e Caicos (+1649)" },
  { value: "1664", label: "Montserrat (+1664)" },
  { value: "1670", label: "Marianas do Norte (+1670)" },
  { value: "1671", label: "Guam (+1671)" },
  { value: "1684", label: "Samoa Americana (+1684)" },
  { value: "1721", label: "Saint Martin (+1721)" },
  { value: "1758", label: "Santa Lúcia (+1758)" },
  { value: "1767", label: "Dominica (+1767)" },
  { value: "1784", label: "São Vicente e Granadinas (+1784)" },
  { value: "1787", label: "Porto Rico (+1787)" },
  { value: "1809", label: "República Dominicana (+1809)" },
  { value: "1829", label: "República Dominicana (+1829)" },
  { value: "1849", label: "República Dominicana (+1849)" },
  { value: "1868", label: "Trinidad e Tobago (+1868)" },
  { value: "1869", label: "Saint Kitts e Nevis (+1869)" },
  { value: "1876", label: "Jamaica (+1876)" },
];

const DDD_OPTIONS = [
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "21",
  "22",
  "24",
  "27",
  "28",
  "31",
  "32",
  "33",
  "34",
  "35",
  "37",
  "38",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "51",
  "53",
  "54",
  "55",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "67",
  "68",
  "69",
  "71",
  "73",
  "74",
  "75",
  "77",
  "79",
  "81",
  "82",
  "83",
  "84",
  "85",
  "86",
  "87",
  "88",
  "89",
  "91",
  "92",
  "93",
  "94",
  "95",
  "96",
  "97",
  "98",
  "99",
];

const AIRPORT_OPTIONS = [
  { code: "GRU", label: "GRU - São Paulo (Guarulhos)" },
  { code: "CGH", label: "CGH - São Paulo (Congonhas)" },
  { code: "VCP", label: "VCP - Campinas (Viracopos)" },
  { code: "GIG", label: "GIG - Rio de Janeiro (Galeão)" },
  { code: "SDU", label: "SDU - Rio de Janeiro (Santos Dumont)" },
  { code: "BSB", label: "BSB - Brasília" },
  { code: "CNF", label: "CNF - Belo Horizonte (Confins)" },
  { code: "SSA", label: "SSA - Salvador" },
  { code: "REC", label: "REC - Recife" },
  { code: "FOR", label: "FOR - Fortaleza" },
  { code: "POA", label: "POA - Porto Alegre" },
  { code: "CWB", label: "CWB - Curitiba" },
  { code: "FLN", label: "FLN - Florianópolis" },
  { code: "MAO", label: "MAO - Manaus" },
  { code: "BEL", label: "BEL - Belém" },
  { code: "NAT", label: "NAT - Natal" },
  { code: "MCZ", label: "MCZ - Maceió" },
  { code: "JPA", label: "JPA - João Pessoa" },
  { code: "AJU", label: "AJU - Aracaju" },
  { code: "CGB", label: "CGB - Cuiabá" },
  { code: "GYN", label: "GYN - Goiânia" },
  { code: "LIS", label: "LIS - Lisboa" },
  { code: "MIA", label: "MIA - Miami" },
  { code: "MAD", label: "MAD - Madrid" },
  { code: "SCL", label: "SCL - Santiago" },
  { code: "EZE", label: "EZE - Buenos Aires (Ezeiza)" },
  { code: "AEP", label: "AEP - Buenos Aires (Aeroparque)" },
  { code: "ASU", label: "ASU - Assunção" },
  { code: "MVD", label: "MVD - Montevidéu" },
  { code: "LIM", label: "LIM - Lima" },
  { code: "CUZ", label: "CUZ - Cusco" },
  { code: "BOG", label: "BOG - Bogotá" },
  { code: "MDE", label: "MDE - Medellín" },
  { code: "CLO", label: "CLO - Cali" },
  { code: "CTG", label: "CTG - Cartagena" },
  { code: "UIO", label: "UIO - Quito" },
  { code: "GYE", label: "GYE - Guayaquil" },
  { code: "LPB", label: "LPB - La Paz" },
  { code: "VVI", label: "VVI - Santa Cruz de la Sierra" },
  { code: "CCS", label: "CCS - Caracas" },
  { code: "PTY", label: "PTY - Cidade do Panamá" },
  { code: "SJO", label: "SJO - San José (Costa Rica)" },
  { code: "GUA", label: "GUA - Cidade da Guatemala" },
  { code: "SAL", label: "SAL - San Salvador" },
  { code: "MEX", label: "MEX - Cidade do México" },
  { code: "NLU", label: "NLU - Cidade do México (AIFA)" },
  { code: "CUN", label: "CUN - Cancún" },
  { code: "GDL", label: "GDL - Guadalajara" },
  { code: "MTY", label: "MTY - Monterrey" },
  { code: "PVR", label: "PVR - Puerto Vallarta" },
  { code: "SJD", label: "SJD - Los Cabos" },
  { code: "HAV", label: "HAV - Havana" },
  { code: "PUJ", label: "PUJ - Punta Cana" },
  { code: "SDQ", label: "SDQ - Santo Domingo" },
  { code: "JFK", label: "JFK - Nova York" },
  { code: "EWR", label: "EWR - Newark" },
  { code: "LGA", label: "LGA - Nova York (LaGuardia)" },
  { code: "BOS", label: "BOS - Boston" },
  { code: "MCO", label: "MCO - Orlando" },
  { code: "FLL", label: "FLL - Fort Lauderdale" },
  { code: "TPA", label: "TPA - Tampa" },
  { code: "IAD", label: "IAD - Washington Dulles" },
  { code: "DCA", label: "DCA - Washington Reagan" },
  { code: "ATL", label: "ATL - Atlanta" },
  { code: "CLT", label: "CLT - Charlotte" },
  { code: "ORD", label: "ORD - Chicago O'Hare" },
  { code: "MDW", label: "MDW - Chicago Midway" },
  { code: "DFW", label: "DFW - Dallas/Fort Worth" },
  { code: "IAH", label: "IAH - Houston Intercontinental" },
  { code: "DEN", label: "DEN - Denver" },
  { code: "PHX", label: "PHX - Phoenix" },
  { code: "LAS", label: "LAS - Las Vegas" },
  { code: "LAX", label: "LAX - Los Angeles" },
  { code: "SAN", label: "SAN - San Diego" },
  { code: "SFO", label: "SFO - San Francisco" },
  { code: "SEA", label: "SEA - Seattle" },
  { code: "YYZ", label: "YYZ - Toronto Pearson" },
  { code: "YTZ", label: "YTZ - Toronto City" },
  { code: "YUL", label: "YUL - Montreal" },
  { code: "YVR", label: "YVR - Vancouver" },
  { code: "YYC", label: "YYC - Calgary" },
  { code: "YEG", label: "YEG - Edmonton" },
  { code: "YOW", label: "YOW - Ottawa" },
  { code: "LHR", label: "LHR - Londres Heathrow" },
  { code: "LGW", label: "LGW - Londres Gatwick" },
  { code: "STN", label: "STN - Londres Stansted" },
  { code: "LTN", label: "LTN - Londres Luton" },
  { code: "MAN", label: "MAN - Manchester" },
  { code: "EDI", label: "EDI - Edimburgo" },
  { code: "DUB", label: "DUB - Dublin" },
  { code: "CDG", label: "CDG - Paris Charles de Gaulle" },
  { code: "ORY", label: "ORY - Paris Orly" },
  { code: "NCE", label: "NCE - Nice" },
  { code: "LYS", label: "LYS - Lyon" },
  { code: "MRS", label: "MRS - Marselha" },
  { code: "AMS", label: "AMS - Amsterdã" },
  { code: "RTM", label: "RTM - Roterdã" },
  { code: "BRU", label: "BRU - Bruxelas" },
  { code: "FRA", label: "FRA - Frankfurt" },
  { code: "MUC", label: "MUC - Munique" },
  { code: "BER", label: "BER - Berlim" },
  { code: "DUS", label: "DUS - Düsseldorf" },
  { code: "HAM", label: "HAM - Hamburgo" },
  { code: "ZRH", label: "ZRH - Zurique" },
  { code: "GVA", label: "GVA - Genebra" },
  { code: "VIE", label: "VIE - Viena" },
  { code: "PRG", label: "PRG - Praga" },
  { code: "BUD", label: "BUD - Budapeste" },
  { code: "WAW", label: "WAW - Varsóvia" },
  { code: "KRK", label: "KRK - Cracóvia" },
  { code: "OTP", label: "OTP - Bucareste" },
  { code: "SOF", label: "SOF - Sófia" },
  { code: "BEG", label: "BEG - Belgrado" },
  { code: "ZAG", label: "ZAG - Zagreb" },
  { code: "LJU", label: "LJU - Ljubljana" },
  { code: "SKP", label: "SKP - Skopje" },
  { code: "TIA", label: "TIA - Tirana" },
  { code: "SJJ", label: "SJJ - Sarajevo" },
  { code: "RIX", label: "RIX - Riga" },
  { code: "VNO", label: "VNO - Vilnius" },
  { code: "TLL", label: "TLL - Tallinn" },
  { code: "CPH", label: "CPH - Copenhague" },
  { code: "ARN", label: "ARN - Estocolmo" },
  { code: "GOT", label: "GOT - Gotemburgo" },
  { code: "OSL", label: "OSL - Oslo" },
  { code: "BGO", label: "BGO - Bergen" },
  { code: "HEL", label: "HEL - Helsinque" },
  { code: "KEF", label: "KEF - Reykjavik" },
  { code: "FCO", label: "FCO - Roma Fiumicino" },
  { code: "CIA", label: "CIA - Roma Ciampino" },
  { code: "MXP", label: "MXP - Milão Malpensa" },
  { code: "LIN", label: "LIN - Milão Linate" },
  { code: "VCE", label: "VCE - Veneza" },
  { code: "NAP", label: "NAP - Nápoles" },
  { code: "ATH", label: "ATH - Atenas" },
  { code: "HER", label: "HER - Heraklion" },
  { code: "IST", label: "IST - Istambul" },
  { code: "SAW", label: "SAW - Istambul Sabiha Gokcen" },
  { code: "ADB", label: "ADB - Izmir" },
  { code: "MLA", label: "MLA - Malta" },
  { code: "LCA", label: "LCA - Larnaca" },
  { code: "DBV", label: "DBV - Dubrovnik" },
  { code: "PMI", label: "PMI - Palma de Mallorca" },
  { code: "AGP", label: "AGP - Málaga" },
  { code: "SVQ", label: "SVQ - Sevilha" },
  { code: "VLC", label: "VLC - Valência" },
  { code: "IBZ", label: "IBZ - Ibiza" },
  { code: "OPO", label: "OPO - Porto" },
  { code: "FAO", label: "FAO - Faro" },
];

const ADHESION_TEXT = [
  "Ao aderir ao Grupo VIP WhatsApp da Vias Aéreas, você recebe alertas de preços 3x por semana.",
  "Valor promocional de entrada: R$ 9,90 no primeiro mês.",
  "A partir do segundo mês, mensalidade de R$ 14,90 via Pix.",
  "Você informa 1 aeroporto de origem e até 3 aeroportos de destino.",
  "A cobrança vence a cada 30 dias.",
  "Enviamos alerta de vencimento 1 dia útil antes.",
  "Se ficar 7 dias sem pagamento, o acesso é removido.",
  "Sem fidelidade e com garantia de reembolso em até 7 dias.",
].join(" ");

function digitsOnly(v: string) {
  return (v || "").replace(/\D+/g, "");
}

function onlyIata(v: string) {
  return String(v || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
}

function formatMoney(cents: number) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

export default function VipPublicSignupClient({ code }: { code: string }) {
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [info, setInfo] = useState<PublicInfoResponse["data"] | null>(null);

  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [employeeWhatsappUrl, setEmployeeWhatsappUrl] = useState<string | null>(
    null
  );
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [form, setForm] = useState<FormState>({
    fullName: "",
    birthDate: "",
    countryCode: "55",
    areaCode: "",
    phoneNumber: "",
    originAirport: "",
    destinationAirport1: "",
    destinationAirport2: "",
    destinationAirport3: "",
  });

  useEffect(() => {
    let active = true;

    (async () => {
      setLoadingInfo(true);
      setInfoError(null);
      try {
        const res = await fetch(`/api/grupo-vip/public/${encodeURIComponent(code)}`, {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as PublicInfoResponse;
        if (!res.ok || !data.ok || !data.data) {
          throw new Error(data.error || "Link inválido ou inativo.");
        }
        if (!active) return;
        setInfo(data.data);
      } catch (e) {
        if (!active) return;
        setInfo(null);
        setInfoError(errorMessage(e, "Erro ao carregar link do funcionário."));
      } finally {
        if (active) setLoadingInfo(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [code]);

  const destinations = useMemo(
    () => [
      form.destinationAirport1,
      form.destinationAirport2,
      form.destinationAirport3,
    ],
    [form.destinationAirport1, form.destinationAirport2, form.destinationAirport3]
  );

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSuccessMessage(null);
    setEmployeeWhatsappUrl(null);

    if (!form.fullName.trim()) {
      alert("Informe seu nome completo.");
      return;
    }
    if (!form.birthDate) {
      alert("Informe sua data de nascimento.");
      return;
    }
    if (!form.countryCode) {
      alert("Selecione o código do país.");
      return;
    }
    if (!digitsOnly(form.areaCode)) {
      alert("Selecione/informe o DDD.");
      return;
    }
    if (digitsOnly(form.phoneNumber).length < 8) {
      alert("Informe um número de WhatsApp válido.");
      return;
    }
    if (!form.originAirport) {
      alert("Selecione o aeroporto de origem.");
      return;
    }
    if (!termsAccepted) {
      alert("Você precisa aceitar os termos de adesão.");
      return;
    }
    if (destinations.some((d) => !d)) {
      alert("Selecione os 3 aeroportos de destino.");
      return;
    }
    if (new Set(destinations).size < destinations.length) {
      alert("Os 3 destinos devem ser diferentes.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        birthDate: form.birthDate,
        countryCode: digitsOnly(form.countryCode),
        areaCode: digitsOnly(form.areaCode),
        phoneNumber: digitsOnly(form.phoneNumber),
        originAirport: form.originAirport,
        destinationAirport1: form.destinationAirport1,
        destinationAirport2: form.destinationAirport2,
        destinationAirport3: form.destinationAirport3,
        termsAccepted: true,
        termsVersion: "vip-whatsapp-v1-2026-02",
      };

      const res = await fetch(`/api/grupo-vip/public/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as RegisterResponse;

      if (!res.ok || !data.ok || !data.data) {
        throw new Error(data.error || "Erro ao enviar cadastro.");
      }

      setSuccessMessage(
        "Cadastro recebido com sucesso. Agora finalize o atendimento no WhatsApp do responsável."
      );
      setEmployeeWhatsappUrl(data.data.employeeWhatsappUrl || null);

      if (data.data.employeeWhatsappUrl) {
        window.open(data.data.employeeWhatsappUrl, "_blank", "noopener,noreferrer");
      }

      setForm({
        fullName: "",
        birthDate: "",
        countryCode: "55",
        areaCode: "",
        phoneNumber: "",
        originAirport: "",
        destinationAirport1: "",
        destinationAirport2: "",
        destinationAirport3: "",
      });
      setTermsAccepted(false);
    } catch (e) {
      alert(errorMessage(e, "Erro ao enviar cadastro."));
    } finally {
      setSaving(false);
    }
  }

  if (loadingInfo) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 text-white">
        <div className="rounded-2xl border border-white/20 bg-white/10 px-6 py-4 text-sm">
          Carregando...
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 px-4">
        <div className="w-full max-w-xl rounded-3xl border border-red-300 bg-white p-8">
          <h1 className="text-2xl font-bold text-slate-900">Link inválido</h1>
          <p className="mt-2 text-slate-600">
            {infoError || "Esse link não está ativo no momento."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#93c5fd_0,_#0b4fbf_45%,_#052a6c_100%)] py-10 px-4">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <section className="rounded-3xl border border-sky-200/60 bg-white/95 p-6 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-3 py-1 text-xs font-semibold text-slate-900">
            OFERTAS DE PASSAGENS
          </div>
          <h1 className="mt-3 text-3xl font-black text-sky-900">
            Grupo VIP WhatsApp • Vias Aéreas
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Cadastro pelo link de <strong>{info.employee.name}</strong> (@
            {info.employee.login})
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <div className="text-xs uppercase tracking-wide text-sky-700">
                1º mês
              </div>
              <div className="mt-1 text-2xl font-extrabold text-sky-900">
                {formatMoney(info.pricing.firstMonthCents)}
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs uppercase tracking-wide text-emerald-700">
                A partir do 2º mês
              </div>
              <div className="mt-1 text-2xl font-extrabold text-emerald-900">
                {formatMoney(info.pricing.recurringMonthCents)}
              </div>
            </div>
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
              <div className="text-xs uppercase tracking-wide text-violet-700">
                Pagamento
              </div>
              <div className="mt-1 text-sm font-bold text-violet-900">
                PIX: {info.pix.key}
              </div>
              <div className="text-xs text-violet-700">{info.pix.label}</div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Termos rápidos de adesão
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{ADHESION_TEXT}</p>
          </div>
        </section>

        <section className="rounded-3xl border border-white/40 bg-white p-6 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
          <h2 className="text-xl font-bold text-slate-900">Faça seu cadastro</h2>
          <p className="mt-1 text-sm text-slate-500">
            Preencha os dados para receber os alertas de passagens.
          </p>

          {successMessage && (
            <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <p>{successMessage}</p>
              {employeeWhatsappUrl && (
                <a
                  href={employeeWhatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  Abrir WhatsApp do responsável
                </a>
              )}
            </div>
          )}

          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Nome completo
                </span>
                <input
                  value={form.fullName}
                  onChange={(e) => setField("fullName", e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-sky-500"
                  placeholder="Seu nome"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Data de nascimento
                </span>
                <input
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => setField("birthDate", e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-sky-500"
                  required
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Código do país
                </span>
                <input
                  value={form.countryCode}
                  onChange={(e) =>
                    setField("countryCode", digitsOnly(e.target.value).slice(0, 4))
                  }
                  list="country-codes-list"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-sky-500"
                  placeholder="55"
                  required
                />
                <datalist id="country-codes-list">
                  {COUNTRY_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </datalist>
                <span className="mt-1 block text-xs text-slate-500">
                  Digite qualquer código internacional (ex.: 55, 1, 351).
                </span>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  DDD / código de área
                </span>
                <input
                  value={form.areaCode}
                  onChange={(e) =>
                    setField("areaCode", digitsOnly(e.target.value).slice(0, 4))
                  }
                  list="area-codes-list"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-sky-500"
                  placeholder={form.countryCode === "55" ? "11" : "212"}
                  required
                />
                <datalist id="area-codes-list">
                  {DDD_OPTIONS.map((ddd) => (
                    <option key={ddd} value={ddd}>
                      {`Brasil DDD ${ddd}`}
                    </option>
                  ))}
                </datalist>
                <span className="mt-1 block text-xs text-slate-500">
                  Lista completa de DDDs do Brasil. Para outros países, pode digitar.
                </span>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Número WhatsApp
                </span>
                <input
                  value={form.phoneNumber}
                  onChange={(e) => setField("phoneNumber", digitsOnly(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-sky-500"
                  placeholder="999999999"
                  maxLength={12}
                  required
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Aeroporto de origem
                </span>
                <input
                  value={form.originAirport}
                  onChange={(e) => setField("originAirport", onlyIata(e.target.value))}
                  list="airports-list"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-sky-500"
                  placeholder="Ex.: GRU"
                  required
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Destino 1
                </span>
                <input
                  value={form.destinationAirport1}
                  onChange={(e) =>
                    setField("destinationAirport1", onlyIata(e.target.value))
                  }
                  list="airports-list"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-sky-500"
                  placeholder="Ex.: LIS"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Destino 2
                </span>
                <input
                  value={form.destinationAirport2}
                  onChange={(e) =>
                    setField("destinationAirport2", onlyIata(e.target.value))
                  }
                  list="airports-list"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-sky-500"
                  placeholder="Ex.: MAD"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Destino 3
                </span>
                <input
                  value={form.destinationAirport3}
                  onChange={(e) =>
                    setField("destinationAirport3", onlyIata(e.target.value))
                  }
                  list="airports-list"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-sky-500"
                  placeholder="Ex.: MIA"
                  required
                />
              </label>
            </div>

            <datalist id="airports-list">
              {AIRPORT_OPTIONS.map((airport) => (
                <option key={airport.code} value={airport.code}>
                  {airport.label}
                </option>
              ))}
            </datalist>

            <label className="mt-1 inline-flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
                required
              />
              <span>
                Li e aceito os termos de adesão (valores, vencimento, regra de
                cancelamento, sem fidelidade e garantia de reembolso em até 7 dias).
              </span>
            </label>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Enviando..." : "Cadastrar e abrir WhatsApp"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
