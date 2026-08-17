import SmartImage from "../SmartImage/SmartImage";
import { assetUrl } from "../../../Services/config";

export default function HeadlineLogo() {
  return (
    <SmartImage
      src={assetUrl("pfp.jpg")}
      alt="Emi"
      width="100%"
      height="100%"
      style={{ objectFit: "cover", display: "block" }}
    />
  );
}
