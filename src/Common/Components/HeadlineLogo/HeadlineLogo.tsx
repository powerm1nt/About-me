import logo from "./pfp.jpg";

const HeadlineLogo = () => {
  return (
    <div
      className="applogo"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.6em",
      }}
    >
      <img
        style={{
          borderRadius: "100%",
          objectFit: "cover",
        }}
        className="logo"
        src={logo}
        height="44px"
        width="44px"
        alt="Emi"
      />
      <p
        style={{
          fontWeight: "700",
          fontSize: "1.2rem",
          margin: 0,
        }}
      >
        Emi
      </p>
    </div>
  );
};

export default HeadlineLogo;
