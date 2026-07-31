import "./Footer.scss";
import projManifest from "../../../package.json";
import logo from "./logo.png";

const Footer = () => {
  return (
    <footer className="main-footer">
      <a
        className="sunproj-logo"
        href="https://nuka.works/"
        rel="noreferrer"
        target="_blank"
        style={{
          display: "flex",
          alignItems: "center",
        }}
      >
        <img
          src={logo}
          height="40px"
          width="40px"
          alt="NukaWorks Logo"
        />
        <p>
          <span>Nuka</span>Works
        </p>
      </a>

      <div className="projAbout">
        <p>© {new Date().getFullYear()} NukaWorks - All rights reserved.</p>
        <a
          href={projManifest.repository}
          rel="noreferrer"
          title="Go to About me ..."
          target="_blank"
          className="buildinfo"
        >
          {projManifest.name}
          <span>@</span>
          {projManifest.version}
        </a>
      </div>
    </footer>
  );
};

export default Footer;
