// pages/api/suburb.js
// Looks up the suburb name for an Australian postcode
// Uses OpenStreetMap Nominatim — free, no API key required

// Manually override ambiguous or commonly misidentified postcodes
// Add more here as needed
const POSTCODE_OVERRIDES = {
  "2000": "Sydney CBD",
  "2010": "Surry Hills",
  "2020": "Mascot",
  "2060": "North Sydney",
  "2065": "St Leonards",
  "2100": "Manly",
  "2150": "Parramatta",
  "2170": "Liverpool",
  "2200": "Bankstown",
  "2204": "Marrickville",
  "2210": "Lugarno",
  "2217": "Kogarah",
  "2220": "Hurstville",
  "2232": "Kirrawee",
  "2234": "Menai",
  "2250": "Gosford",
  "2300": "Newcastle",
  "2500": "Wollongong",
  "2560": "Campbelltown",
  "2570": "Camden",
  "2747": "Penrith",
  "2750": "Penrith",
  "3000": "Melbourne CBD",
  "4000": "Brisbane CBD",
  "5000": "Adelaide CBD",
  "6000": "Perth CBD",
  "7000": "Hobart CBD",
  "0800": "Darwin CBD",
};

export default async function handler(req, res) {
  const { postcode } = req.query;

  if (!postcode || !/^\d{4}$/.test(postcode)) {
    return res.status(400).json({ error: "Invalid postcode" });
  }

  // Check manual overrides first
  if (POSTCODE_OVERRIDES[postcode]) {
    return res.status(200).json({ suburb: POSTCODE_OVERRIDES[postcode] });
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?postalcode=${postcode}&country=Australia&format=json&addressdetails=1&limit=5`,
      {
        headers: {
          // Required by Nominatim usage policy
          "User-Agent": "LuxeCantileverAgent/1.0 (sales@luxecantilever.com.au)",
        },
      }
    );

    const data = await response.json();

    if (!data || data.length === 0) {
      return res.status(200).json({ suburb: null });
    }

    // Pick the best result — prefer towns/suburbs over larger areas
    const preferred = data.find(r =>
      ["suburb", "town", "village", "neighbourhood", "quarter"].includes(r.addresstype)
    ) || data[0];

    const addr = preferred.address || {};

    // Extract the most specific locality name available
    const suburb =
      addr.suburb ||
      addr.town ||
      addr.village ||
      addr.neighbourhood ||
      addr.county ||
      addr.state_district ||
      null;

    return res.status(200).json({ suburb });
  } catch (err) {
    console.error("Suburb lookup error:", err);
    return res.status(200).json({ suburb: null });
  }
}
