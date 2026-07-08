// Generator for lib/cities.ts — a bundled, curated list of major world cities.
// Source: hand-curated from public geographic knowledge (most-populous cities per
// country + top US cities by population). No PII; all data is public place names.
//
// Country labels are written to EXACTLY match lib/options.ts COUNTRIES so that
// selecting a suggestion can auto-populate the Country <select>. US cities carry
// their full state name (matching lib/options.ts US_STATES).
//
// Format of each row below:
//   Non-US:  "City|Country"
//   US:      "City|United States|State"
import { writeFileSync } from "node:fs";

// ---- US cities (top ~330 by population), "City|State" ----
const US = `
New York|New York
Los Angeles|California
Chicago|Illinois
Houston|Texas
Phoenix|Arizona
Philadelphia|Pennsylvania
San Antonio|Texas
San Diego|California
Dallas|Texas
San Jose|California
Austin|Texas
Jacksonville|Florida
Fort Worth|Texas
Columbus|Ohio
Charlotte|North Carolina
San Francisco|California
Indianapolis|Indiana
Seattle|Washington
Denver|Colorado
Washington|District of Columbia
Boston|Massachusetts
El Paso|Texas
Nashville|Tennessee
Detroit|Michigan
Oklahoma City|Oklahoma
Portland|Oregon
Las Vegas|Nevada
Memphis|Tennessee
Louisville|Kentucky
Baltimore|Maryland
Milwaukee|Wisconsin
Albuquerque|New Mexico
Tucson|Arizona
Fresno|California
Mesa|Arizona
Sacramento|California
Atlanta|Georgia
Kansas City|Missouri
Colorado Springs|Colorado
Omaha|Nebraska
Raleigh|North Carolina
Miami|Florida
Long Beach|California
Virginia Beach|Virginia
Oakland|California
Minneapolis|Minnesota
Tulsa|Oklahoma
Tampa|Florida
Arlington|Texas
New Orleans|Louisiana
Wichita|Kansas
Cleveland|Ohio
Bakersfield|California
Aurora|Colorado
Anaheim|California
Honolulu|Hawaii
Santa Ana|California
Riverside|California
Corpus Christi|Texas
Lexington|Kentucky
Henderson|Nevada
Stockton|California
Saint Paul|Minnesota
Cincinnati|Ohio
Greensboro|North Carolina
Pittsburgh|Pennsylvania
Irvine|California
St. Louis|Missouri
Lincoln|Nebraska
Orlando|Florida
Durham|North Carolina
Plano|Texas
Anchorage|Alaska
Newark|New Jersey
Chandler|Arizona
Chula Vista|California
Fort Wayne|Indiana
Toledo|Ohio
St. Petersburg|Florida
Laredo|Texas
Jersey City|New Jersey
Chesapeake|Virginia
Norfolk|Virginia
Madison|Wisconsin
Lubbock|Texas
Baton Rouge|Louisiana
Buffalo|New York
North Las Vegas|Nevada
Gilbert|Arizona
Glendale|Arizona
Reno|Nevada
Hialeah|Florida
Garland|Texas
Chandler|Arizona
Irving|Texas
Scottsdale|Arizona
Fremont|California
Boise|Idaho
Richmond|Virginia
San Bernardino|California
Birmingham|Alabama
Spokane|Washington
Rochester|New York
Des Moines|Iowa
Modesto|California
Fayetteville|North Carolina
Tacoma|Washington
Oxnard|California
Fontana|California
Columbus|Georgia
Montgomery|Alabama
Moreno Valley|California
Shreveport|Louisiana
Aurora|Illinois
Yonkers|New York
Akron|Ohio
Huntington Beach|California
Little Rock|Arkansas
Augusta|Georgia
Amarillo|Texas
Glendale|California
Mobile|Alabama
Grand Rapids|Michigan
Salt Lake City|Utah
Tallahassee|Florida
Huntsville|Alabama
Grand Prairie|Texas
Knoxville|Tennessee
Worcester|Massachusetts
Newport News|Virginia
Brownsville|Texas
Overland Park|Kansas
Santa Clarita|California
Providence|Rhode Island
Garden Grove|California
Chattanooga|Tennessee
Oceanside|California
Jackson|Mississippi
Fort Lauderdale|Florida
Santa Rosa|California
Rancho Cucamonga|California
Port St. Lucie|Florida
Tempe|Arizona
Ontario|California
Vancouver|Washington
Cape Coral|Florida
Sioux Falls|South Dakota
Springfield|Missouri
Peoria|Arizona
Pembroke Pines|Florida
Elk Grove|California
Salem|Oregon
Lancaster|California
Corona|California
Eugene|Oregon
Palmdale|California
Salinas|California
Springfield|Massachusetts
Pasadena|Texas
Fort Collins|Colorado
Hayward|California
Pomona|California
Cary|North Carolina
Rockford|Illinois
Alexandria|Virginia
Escondido|California
McKinney|Texas
Kansas City|Kansas
Joliet|Illinois
Sunnyvale|California
Torrance|California
Bridgeport|Connecticut
Lakewood|Colorado
Hollywood|Florida
Paterson|New Jersey
Naperville|Illinois
Syracuse|New York
Mesquite|Texas
Dayton|Ohio
Savannah|Georgia
Clarksville|Tennessee
Orange|California
Pasadena|California
Fullerton|California
Killeen|Texas
Frisco|Texas
Hampton|Virginia
McAllen|Texas
Warren|Michigan
Bellevue|Washington
West Valley City|Utah
Columbia|South Carolina
Olathe|Kansas
Sterling Heights|Michigan
New Haven|Connecticut
Miramar|Florida
Waco|Texas
Thousand Oaks|California
Cedar Rapids|Iowa
Charleston|South Carolina
Visalia|California
Topeka|Kansas
Elizabeth|New Jersey
Gainesville|Florida
Thornton|Colorado
Roseville|California
Carrollton|Texas
Coral Springs|Florida
Stamford|Connecticut
Simi Valley|California
Concord|California
Hartford|Connecticut
Kent|Washington
Lafayette|Louisiana
Midland|Texas
Surprise|Arizona
Denton|Texas
Victorville|California
Evansville|Indiana
Santa Clara|California
Abilene|Texas
Athens|Georgia
Vallejo|California
Allentown|Pennsylvania
Norman|Oklahoma
Beaumont|Texas
Independence|Missouri
Murfreesboro|Tennessee
Ann Arbor|Michigan
Springfield|Illinois
Berkeley|California
Peoria|Illinois
Provo|Utah
El Monte|California
Columbia|Missouri
Lansing|Michigan
Fargo|North Dakota
Downey|California
Costa Mesa|California
Wilmington|North Carolina
Arvada|Colorado
Inglewood|California
Miami Gardens|Florida
Carlsbad|California
Westminster|Colorado
Rochester|Minnesota
Odessa|Texas
Manchester|New Hampshire
Elgin|Illinois
West Jordan|Utah
Round Rock|Texas
Clearwater|Florida
Waterbury|Connecticut
Gresham|Oregon
Fairfield|California
Billings|Montana
Lowell|Massachusetts
San Buenaventura|California
Pueblo|Colorado
High Point|North Carolina
West Covina|California
Richmond|California
Murrieta|California
Cambridge|Massachusetts
Antioch|California
Temecula|California
Norwalk|California
Centennial|Colorado
Everett|Washington
Palm Bay|Florida
Wichita Falls|Texas
Green Bay|Wisconsin
Daly City|California
Burbank|California
Richardson|Texas
Pompano Beach|Florida
North Charleston|South Carolina
Broken Arrow|Oklahoma
Boulder|Colorado
West Palm Beach|Florida
Santa Maria|California
El Cajon|California
Davenport|Iowa
Rialto|California
Las Cruces|New Mexico
San Mateo|California
Lewisville|Texas
South Bend|Indiana
Lakeland|Florida
Erie|Pennsylvania
Tyler|Texas
Pearland|Texas
College Station|Texas
Kenosha|Wisconsin
Sandy Springs|Georgia
Clovis|California
Flint|Michigan
Roanoke|Virginia
Albany|New York
Jurupa Valley|California
Compton|California
San Angelo|Texas
Hillsboro|Oregon
Lawton|Oklahoma
Renton|Washington
Vista|California
Davie|Florida
Greeley|Colorado
Mission Viejo|California
Portsmouth|Virginia
Dearborn|Michigan
South Gate|California
Tuscaloosa|Alabama
Livonia|Michigan
New Bedford|Massachusetts
Vacaville|California
Brockton|Massachusetts
Bend|Oregon
Quincy|Massachusetts
Fishers|Indiana
Yakima|Washington
Federal Way|Washington
Carmel|Indiana
`;

// ---- World cities (non-US), "City|Country" ----
// Country labels match lib/options.ts COUNTRIES exactly.
const WORLD = `
Toronto|Canada
Montreal|Canada
Calgary|Canada
Ottawa|Canada
Edmonton|Canada
Winnipeg|Canada
Mississauga|Canada
Vancouver|Canada
Brampton|Canada
Hamilton|Canada
Quebec City|Canada
Surrey|Canada
Laval|Canada
Halifax|Canada
London|Canada
Victoria|Canada
Windsor|Canada
Saskatoon|Canada
Regina|Canada
Kitchener|Canada
Mexico City|Mexico
Guadalajara|Mexico
Monterrey|Mexico
Puebla|Mexico
Tijuana|Mexico
Ciudad Juarez|Mexico
Leon|Mexico
Zapopan|Mexico
Ecatepec|Mexico
Cancun|Mexico
Merida|Mexico
Queretaro|Mexico
Toluca|Mexico
Chihuahua|Mexico
Aguascalientes|Mexico
Acapulco|Mexico
Morelia|Mexico
Hermosillo|Mexico
Culiacan|Mexico
Oaxaca|Mexico
Sao Paulo|Brazil
Rio de Janeiro|Brazil
Brasilia|Brazil
Salvador|Brazil
Fortaleza|Brazil
Belo Horizonte|Brazil
Manaus|Brazil
Curitiba|Brazil
Recife|Brazil
Porto Alegre|Brazil
Belem|Brazil
Goiania|Brazil
Guarulhos|Brazil
Campinas|Brazil
Sao Luis|Brazil
Maceio|Brazil
Natal|Brazil
Florianopolis|Brazil
Buenos Aires|Argentina
Cordoba|Argentina
Rosario|Argentina
Mendoza|Argentina
La Plata|Argentina
Tucuman|Argentina
Mar del Plata|Argentina
Salta|Argentina
Santa Fe|Argentina
San Juan|Argentina
Santiago|Chile
Valparaiso|Chile
Concepcion|Chile
Antofagasta|Chile
Vina del Mar|Chile
Temuco|Chile
Bogota|Colombia
Medellin|Colombia
Cali|Colombia
Barranquilla|Colombia
Cartagena|Colombia
Cucuta|Colombia
Bucaramanga|Colombia
Pereira|Colombia
Santa Marta|Colombia
Lima|Peru
Arequipa|Peru
Trujillo|Peru
Chiclayo|Peru
Piura|Peru
Cusco|Peru
London|United Kingdom
Birmingham|United Kingdom
Manchester|United Kingdom
Glasgow|United Kingdom
Liverpool|United Kingdom
Leeds|United Kingdom
Sheffield|United Kingdom
Edinburgh|United Kingdom
Bristol|United Kingdom
Cardiff|United Kingdom
Belfast|United Kingdom
Leicester|United Kingdom
Coventry|United Kingdom
Nottingham|United Kingdom
Newcastle|United Kingdom
Brighton|United Kingdom
Southampton|United Kingdom
Reading|United Kingdom
Oxford|United Kingdom
Cambridge|United Kingdom
Aberdeen|United Kingdom
York|United Kingdom
Paris|France
Marseille|France
Lyon|France
Toulouse|France
Nice|France
Nantes|France
Strasbourg|France
Montpellier|France
Bordeaux|France
Lille|France
Rennes|France
Reims|France
Toulon|France
Grenoble|France
Dijon|France
Angers|France
Nimes|France
Berlin|Germany
Hamburg|Germany
Munich|Germany
Cologne|Germany
Frankfurt|Germany
Stuttgart|Germany
Dusseldorf|Germany
Leipzig|Germany
Dortmund|Germany
Essen|Germany
Bremen|Germany
Dresden|Germany
Hanover|Germany
Nuremberg|Germany
Duisburg|Germany
Bochum|Germany
Wuppertal|Germany
Bonn|Germany
Mannheim|Germany
Madrid|Spain
Barcelona|Spain
Valencia|Spain
Seville|Spain
Zaragoza|Spain
Malaga|Spain
Murcia|Spain
Palma|Spain
Bilbao|Spain
Alicante|Spain
Cordoba|Spain
Valladolid|Spain
Vigo|Spain
Granada|Spain
Rome|Italy
Milan|Italy
Naples|Italy
Turin|Italy
Palermo|Italy
Genoa|Italy
Bologna|Italy
Florence|Italy
Bari|Italy
Catania|Italy
Venice|Italy
Verona|Italy
Messina|Italy
Padua|Italy
Trieste|Italy
Lisbon|Portugal
Porto|Portugal
Braga|Portugal
Coimbra|Portugal
Funchal|Portugal
Amsterdam|Netherlands
Rotterdam|Netherlands
The Hague|Netherlands
Utrecht|Netherlands
Eindhoven|Netherlands
Groningen|Netherlands
Tilburg|Netherlands
Brussels|Belgium
Antwerp|Belgium
Ghent|Belgium
Charleroi|Belgium
Liege|Belgium
Bruges|Belgium
Zurich|Switzerland
Geneva|Switzerland
Basel|Switzerland
Bern|Switzerland
Lausanne|Switzerland
Vienna|Austria
Graz|Austria
Linz|Austria
Salzburg|Austria
Innsbruck|Austria
Dublin|Ireland
Cork|Ireland
Limerick|Ireland
Galway|Ireland
Stockholm|Sweden
Gothenburg|Sweden
Malmo|Sweden
Uppsala|Sweden
Oslo|Norway
Bergen|Norway
Trondheim|Norway
Stavanger|Norway
Copenhagen|Denmark
Aarhus|Denmark
Odense|Denmark
Aalborg|Denmark
Helsinki|Finland
Espoo|Finland
Tampere|Finland
Turku|Finland
Warsaw|Poland
Krakow|Poland
Lodz|Poland
Wroclaw|Poland
Poznan|Poland
Gdansk|Poland
Szczecin|Poland
Prague|Czech Republic
Brno|Czech Republic
Ostrava|Czech Republic
Budapest|Hungary
Debrecen|Hungary
Szeged|Hungary
Athens|Greece
Thessaloniki|Greece
Patras|Greece
Heraklion|Greece
Bucharest|Romania
Cluj-Napoca|Romania
Timisoara|Romania
Iasi|Romania
Constanta|Romania
Moscow|Russia
Saint Petersburg|Russia
Novosibirsk|Russia
Yekaterinburg|Russia
Kazan|Russia
Nizhny Novgorod|Russia
Chelyabinsk|Russia
Samara|Russia
Omsk|Russia
Rostov-on-Don|Russia
Ufa|Russia
Krasnoyarsk|Russia
Kyiv|Ukraine
Kharkiv|Ukraine
Odesa|Ukraine
Dnipro|Ukraine
Lviv|Ukraine
Istanbul|Turkey
Ankara|Turkey
Izmir|Turkey
Bursa|Turkey
Adana|Turkey
Gaziantep|Turkey
Konya|Turkey
Antalya|Turkey
Kayseri|Turkey
Tokyo|Japan
Yokohama|Japan
Osaka|Japan
Nagoya|Japan
Sapporo|Japan
Fukuoka|Japan
Kobe|Japan
Kyoto|Japan
Kawasaki|Japan
Saitama|Japan
Hiroshima|Japan
Sendai|Japan
Chiba|Japan
Kitakyushu|Japan
Beijing|China
Shanghai|China
Guangzhou|China
Shenzhen|China
Chengdu|China
Tianjin|China
Wuhan|China
Chongqing|China
Xian|China
Hangzhou|China
Nanjing|China
Shenyang|China
Qingdao|China
Suzhou|China
Dongguan|China
Zhengzhou|China
Changsha|China
Kunming|China
Dalian|China
Harbin|China
Seoul|South Korea
Busan|South Korea
Incheon|South Korea
Daegu|South Korea
Daejeon|South Korea
Gwangju|South Korea
Suwon|South Korea
Ulsan|South Korea
Taipei|Taiwan
Kaohsiung|Taiwan
Taichung|Taiwan
Tainan|Taiwan
Hong Kong|Hong Kong
Singapore|Singapore
Bangkok|Thailand
Chiang Mai|Thailand
Nonthaburi|Thailand
Pattaya|Thailand
Phuket|Thailand
Hanoi|Vietnam
Ho Chi Minh City|Vietnam
Da Nang|Vietnam
Hai Phong|Vietnam
Can Tho|Vietnam
Jakarta|Indonesia
Surabaya|Indonesia
Bandung|Indonesia
Medan|Indonesia
Semarang|Indonesia
Makassar|Indonesia
Palembang|Indonesia
Denpasar|Indonesia
Kuala Lumpur|Malaysia
George Town|Malaysia
Ipoh|Malaysia
Johor Bahru|Malaysia
Manila|Philippines
Quezon City|Philippines
Davao City|Philippines
Cebu City|Philippines
Makati|Philippines
Mumbai|India
Delhi|India
Bangalore|India
Hyderabad|India
Ahmedabad|India
Chennai|India
Kolkata|India
Surat|India
Pune|India
Jaipur|India
Lucknow|India
Kanpur|India
Nagpur|India
Indore|India
Bhopal|India
Patna|India
Vadodara|India
Coimbatore|India
Kochi|India
Chandigarh|India
Karachi|Pakistan
Lahore|Pakistan
Faisalabad|Pakistan
Rawalpindi|Pakistan
Islamabad|Pakistan
Multan|Pakistan
Peshawar|Pakistan
Quetta|Pakistan
Dhaka|Bangladesh
Chittagong|Bangladesh
Khulna|Bangladesh
Rajshahi|Bangladesh
Sylhet|Bangladesh
Dubai|United Arab Emirates
Abu Dhabi|United Arab Emirates
Sharjah|United Arab Emirates
Al Ain|United Arab Emirates
Ajman|United Arab Emirates
Riyadh|Saudi Arabia
Jeddah|Saudi Arabia
Mecca|Saudi Arabia
Medina|Saudi Arabia
Dammam|Saudi Arabia
Doha|Qatar
Al Rayyan|Qatar
Jerusalem|Israel
Tel Aviv|Israel
Haifa|Israel
Rishon LeZion|Israel
Cairo|Egypt
Alexandria|Egypt
Giza|Egypt
Shubra El Kheima|Egypt
Port Said|Egypt
Lagos|Nigeria
Kano|Nigeria
Ibadan|Nigeria
Abuja|Nigeria
Port Harcourt|Nigeria
Benin City|Nigeria
Nairobi|Kenya
Mombasa|Kenya
Kisumu|Kenya
Nakuru|Kenya
Johannesburg|South Africa
Cape Town|South Africa
Durban|South Africa
Pretoria|South Africa
Port Elizabeth|South Africa
Bloemfontein|South Africa
Sydney|Australia
Melbourne|Australia
Brisbane|Australia
Perth|Australia
Adelaide|Australia
Gold Coast|Australia
Canberra|Australia
Newcastle|Australia
Wollongong|Australia
Hobart|Australia
Darwin|Australia
Auckland|New Zealand
Wellington|New Zealand
Christchurch|New Zealand
Tauranga|New Zealand
Dunedin|New Zealand
`;

// ---- Second batch: additional non-US cities to broaden coverage ----
const WORLD2 = `
Mesa|Canada_SKIP
Barrie|Canada
Guelph|Canada
Kelowna|Canada
Kingston|Canada
Sherbrooke|Canada
Abbotsford|Canada
Trois-Rivieres|Canada
Oshawa|Canada
Gatineau|Canada
Sudbury|Canada
Thunder Bay|Canada
St. Catharines|Canada
Cambridge|Canada
Waterloo|Canada
Burnaby|Canada
Richmond|Canada
Markham|Canada
Vaughan|Canada
Longueuil|Canada
Nezahualcoyotl|Mexico
Naucalpan|Mexico
Mexicali|Mexico
Saltillo|Mexico
Cuernavaca|Mexico
Villahermosa|Mexico
Tampico|Mexico
Reynosa|Mexico
Torreon|Mexico
Durango|Mexico
Veracruz|Mexico
Tuxtla Gutierrez|Mexico
Santo Andre|Brazil
Osasco|Brazil
Ribeirao Preto|Brazil
Sorocaba|Brazil
Uberlandia|Brazil
Cuiaba|Brazil
Joinville|Brazil
Juiz de Fora|Brazil
Londrina|Brazil
Niteroi|Brazil
Campo Grande|Brazil
Teresina|Brazil
Joao Pessoa|Brazil
Aracaju|Brazil
Quilmes|Argentina
Bahia Blanca|Argentina
Neuquen|Argentina
Posadas|Argentina
Resistencia|Argentina
Santiago del Estero|Argentina
La Serena|Chile
Rancagua|Chile
Talca|Chile
Arica|Chile
Iquique|Chile
Puerto Montt|Chile
Soledad|Colombia
Ibague|Colombia
Villavicencio|Colombia
Manizales|Colombia
Neiva|Colombia
Callao|Peru
Iquitos|Peru
Huancayo|Peru
Tacna|Peru
Sunderland|United Kingdom
Wolverhampton|United Kingdom
Plymouth|United Kingdom
Derby|United Kingdom
Portsmouth|United Kingdom
Swansea|United Kingdom
Milton Keynes|United Kingdom
Aberdeen|United Kingdom
Norwich|United Kingdom
Luton|United Kingdom
Bournemouth|United Kingdom
Middlesbrough|United Kingdom
Sunderland|United Kingdom
Le Havre|France
Saint-Etienne|France
Toulon|France
Angers|France
Villeurbanne|France
Clermont-Ferrand|France
Le Mans|France
Aix-en-Provence|France
Brest|France
Tours|France
Amiens|France
Limoges|France
Metz|France
Perpignan|France
Bielefeld|Germany
Karlsruhe|Germany
Munster|Germany
Augsburg|Germany
Wiesbaden|Germany
Gelsenkirchen|Germany
Monchengladbach|Germany
Braunschweig|Germany
Kiel|Germany
Aachen|Germany
Halle|Germany
Magdeburg|Germany
Freiburg|Germany
Krefeld|Germany
Mainz|Germany
Erfurt|Germany
Sabadell|Spain
Gijon|Spain
Hospitalet|Spain
La Coruna|Spain
Vitoria|Spain
Elche|Spain
Oviedo|Spain
Terrassa|Spain
Cartagena|Spain
Pamplona|Spain
Almeria|Spain
Salamanca|Spain
Trieste|Italy
Brescia|Italy
Parma|Italy
Modena|Italy
Reggio Calabria|Italy
Perugia|Italy
Livorno|Italy
Cagliari|Italy
Ravenna|Italy
Rimini|Italy
Salerno|Italy
Amadora|Portugal
Setubal|Portugal
Almada|Portugal
Haarlem|Netherlands
Arnhem|Netherlands
Nijmegen|Netherlands
Enschede|Netherlands
Apeldoorn|Netherlands
Amersfoort|Netherlands
Namur|Belgium
Leuven|Belgium
Mons|Belgium
Winterthur|Switzerland
Lucerne|Switzerland
St. Gallen|Switzerland
Lugano|Switzerland
Klagenfurt|Austria
Villach|Austria
Waterford|Ireland
Drogheda|Ireland
Vasteras|Sweden
Orebro|Sweden
Linkoping|Sweden
Helsingborg|Sweden
Drammen|Norway
Fredrikstad|Norway
Kristiansand|Norway
Esbjerg|Denmark
Randers|Denmark
Vantaa|Finland
Oulu|Finland
Bydgoszcz|Poland
Lublin|Poland
Katowice|Poland
Bialystok|Poland
Plzen|Czech Republic
Liberec|Czech Republic
Olomouc|Czech Republic
Miskolc|Hungary
Pecs|Hungary
Gyor|Hungary
Larissa|Greece
Volos|Greece
Craiova|Romania
Brasov|Romania
Galati|Romania
Ploiesti|Romania
Voronezh|Russia
Perm|Russia
Volgograd|Russia
Krasnodar|Russia
Saratov|Russia
Tyumen|Russia
Tolyatti|Russia
Izhevsk|Russia
Barnaul|Russia
Irkutsk|Russia
Vladivostok|Russia
Zaporizhzhia|Ukraine
Kryvyi Rih|Ukraine
Mykolaiv|Ukraine
Mariupol|Ukraine
Mersin|Turkey
Diyarbakir|Turkey
Eskisehir|Turkey
Samsun|Turkey
Denizli|Turkey
Malatya|Turkey
Kahramanmaras|Turkey
Kumamoto|Japan
Okayama|Japan
Shizuoka|Japan
Hamamatsu|Japan
Niigata|Japan
Kanazawa|Japan
Nara|Japan
Nagasaki|Japan
Oita|Japan
Toyama|Japan
Jinan|China
Changchun|China
Shijiazhuang|China
Taiyuan|China
Hefei|China
Urumqi|China
Fuzhou|China
Wuxi|China
Ningbo|China
Nanchang|China
Guiyang|China
Nanning|China
Lanzhou|China
Xiamen|China
Foshan|China
Wenzhou|China
Tangshan|China
Goyang|South Korea
Yongin|South Korea
Seongnam|South Korea
Cheongju|South Korea
Ansan|South Korea
Hsinchu|Taiwan
Keelung|Taiwan
Chiayi|Taiwan
Nakhon Ratchasima|Thailand
Udon Thani|Thailand
Khon Kaen|Thailand
Hat Yai|Thailand
Bien Hoa|Vietnam
Hue|Vietnam
Nha Trang|Vietnam
Vung Tau|Vietnam
Tangerang|Indonesia
Depok|Indonesia
Bekasi|Indonesia
Padang|Indonesia
Malang|Indonesia
Yogyakarta|Indonesia
Shah Alam|Malaysia
Petaling Jaya|Malaysia
Kuching|Malaysia
Kota Kinabalu|Malaysia
Caloocan|Philippines
Zamboanga City|Philippines
Antipolo|Philippines
Pasig|Philippines
Taguig|Philippines
Cagayan de Oro|Philippines
Visakhapatnam|India
Agra|India
Nashik|India
Faridabad|India
Meerut|India
Rajkot|India
Varanasi|India
Srinagar|India
Amritsar|India
Ranchi|India
Jodhpur|India
Guwahati|India
Gwalior|India
Thiruvananthapuram|India
Mysore|India
Hyderabad|Pakistan
Gujranwala|Pakistan
Sialkot|Pakistan
Bahawalpur|Pakistan
Sargodha|Pakistan
Narayanganj|Bangladesh
Gazipur|Bangladesh
Comilla|Bangladesh
Ras Al Khaimah|United Arab Emirates
Fujairah|United Arab Emirates
Tabuk|Saudi Arabia
Buraidah|Saudi Arabia
Khobar|Saudi Arabia
Abha|Saudi Arabia
Al Wakrah|Qatar
Beersheba|Israel
Netanya|Israel
Ashdod|Israel
Luxor|Egypt
Aswan|Egypt
Mansoura|Egypt
Tanta|Egypt
Suez|Egypt
Kaduna|Nigeria
Enugu|Nigeria
Abeokuta|Nigeria
Onitsha|Nigeria
Warri|Nigeria
Eldoret|Kenya
Thika|Kenya
Soweto|South Africa
Benoni|South Africa
Pietermaritzburg|South Africa
East London|South Africa
Vereeniging|South Africa
Sunshine Coast|Australia
Geelong|Australia
Townsville|Australia
Cairns|Australia
Toowoomba|Australia
Ballarat|Australia
Bendigo|Australia
Launceston|Australia
Lower Hutt|New Zealand
Palmerston North|New Zealand
Napier|New Zealand
Nelson|New Zealand
`;

const rows = [];
// US_STATES in lib/options.ts lists only the 50 states — no "District of
// Columbia" — and the signup/family State <select> is built from that list. So a
// DC row must ship WITHOUT a state, otherwise picking "Washington" (DC) would try
// to set a state value the <select> can't display. City + Country still fill.
const US_STATE_SET = new Set([
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
  "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
  "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada",
  "New Hampshire","New Jersey","New Mexico","New York","North Carolina",
  "North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island",
  "South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
  "Virginia","Washington","West Virginia","Wisconsin","Wyoming",
]);
for (const line of US.trim().split("\n")) {
  const [city, state] = line.split("|");
  rows.push({
    city,
    country: "United States",
    state: US_STATE_SET.has(state) ? state : undefined,
  });
}
for (const line of (WORLD.trim() + "\n" + WORLD2.trim()).split("\n")) {
  const [city, country] = line.split("|");
  if (!city || !country || country.endsWith("_SKIP")) continue;
  rows.push({ city, country });
}

// Dedupe on city+country+state (some US city names legitimately repeat across
// states, e.g. Springfield / Columbus — those stay as distinct rows).
const seen = new Set();
const deduped = [];
for (const r of rows) {
  const key = `${r.city}|${r.country}|${r.state ?? ""}`;
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push(r);
}

// Emit as a compact tuple array to keep the bundle small:
//   [city, country]                for non-US
//   [city, "United States", state] for US
const tuples = deduped.map((r) =>
  r.state ? [r.city, r.country, r.state] : [r.city, r.country],
);

const header = `// AUTO-GENERATED by scripts/gen-cities (curated). Do not edit by hand.
//
// A bundled, privacy-preserving list of major world cities used to power the
// city autocomplete on the signup form and family editor. Keyless: matching runs
// entirely client-side against this static list — no keystrokes ever leave the
// browser and no external geocoding API is called.
//
// Source: hand-curated from public geographic data (most-populous cities per
// country plus the top US cities by population). Place names only — contains NO
// personal data. Country labels match lib/options.ts COUNTRIES and US state names
// match lib/options.ts US_STATES so a picked suggestion can auto-fill those
// fields. ~${tuples.length} entries.

export type City = {
  /** City name as displayed. */
  name: string;
  /** Country label — matches lib/options.ts COUNTRIES exactly. */
  country: string;
  /** Full US state name (matches lib/options.ts US_STATES); omitted for non-US. */
  state?: string;
};

// Stored as compact tuples to keep the bundle small, then mapped to objects.
// [name, country] or [name, "United States", state].
const RAW: ReadonlyArray<readonly [string, string] | readonly [string, string, string]> = ${JSON.stringify(
  tuples,
)};

export const CITIES: readonly City[] = RAW.map(([name, country, state]) =>
  state ? { name, country, state } : { name, country },
);
`;

writeFileSync(new URL("../lib/cities.ts", import.meta.url), header);
console.log(`Generated ${tuples.length} cities`);
