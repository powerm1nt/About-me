import React from "react";
import "./Header.scss";
import HeadlineLogo from "../../Common/Components/HeadlineLogo/HeadlineLogo";
import Button from "../../Common/Components/Button/Button.jsx";

const Header = () => {
  return (
    <header className="main-header">
      <HeadlineLogo />
      <Button className="btn-viewlink">
        <a
          href="https://www.linkedin.com/in/lchab1440/"
          rel="noreferrer"
          target="_blank"
        >
          View on LinkedIn
        </a>
      </Button>
    </header>
  );
};

export default Header;
