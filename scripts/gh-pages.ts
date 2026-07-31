import ghpages from "gh-pages";

ghpages.publish("dist", (err) => {
  if (err) {
    console.error("Gh-Pages task failed:", err);
    process.exit(1);
  }
  console.log("Gh-Pages task success !");
});
