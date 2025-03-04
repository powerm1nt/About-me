import React from "react";
import "./Header.scss";
import ModularKitLogo from "../../Common/Components/ModularKitLogo/ModularKitLogo";
import Button from "../../Common/Components/Button/Button.jsx";

const Header = () => {
  return (
    <header className="main-header">
      <ModularKitLogo />
      <Button className="btn-viewlink">
        <a
          href="hhttps://git.nuka.works/nukaworks/toolkits/ModularKit/"
          rel="noreferrer"
          target="_blank"
        >
          View on Github
        </a>
      </Button>
    </header>
  );
};

export default Header;
