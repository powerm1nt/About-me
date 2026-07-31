import logo from "./pfp.jpg";

const HeadlineLogo = () => {
  return (
    <div
      className="applogo"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5em",
      }}
    >
      <img
        style={{
          borderRadius: "100%",
        }}
        className="logo"
        src={logo}
        height="48px"
        width="48px"
        alt="About me"
      />
      <p
        style={{
          fontWeight: "400",
          fontSize: "1.2rem",
        }}
      >
        About me
      </p>
    </div>
  );
};

export default HeadlineLogo;
