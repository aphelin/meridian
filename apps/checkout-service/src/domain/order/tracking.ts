const CARRIER_URLS: Record<string, (trackingNumber: string) => string> = {
  dhl: (n) => `https://www.dhl.com/global-en/home/tracking/tracking-parcel.html?tracking-id=${n}`,
  dpd: (n) => `https://tracking.dpd.de/status/en_US/parcel/${n}`,
  ups: (n) => `https://www.ups.com/track?tracknum=${n}`,
  fedex: (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}`,
  gls: (n) => `https://gls-group.com/track/${n}`,
};

/** Public tracking link for a carrier; unknown carriers get a generic parcel search link. */
export function trackingUrlFor(carrier: string, trackingNumber: string): string {
  const number = encodeURIComponent(trackingNumber.trim());
  const known = CARRIER_URLS[carrier.trim().toLowerCase()];
  return known ? known(number) : `https://parcelsapp.com/en/tracking/${number}`;
}
