import { formatListingDescription } from "../lib/listing-description";

export function ListingDescription({ value }: { value: string }) {
  return <div className="listing-description-content" dangerouslySetInnerHTML={{
    __html: formatListingDescription(value),
  }} />;
}
