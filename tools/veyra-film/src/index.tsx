import "@fontsource/barlow-condensed/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import { Composition, registerRoot } from "remotion";
import { VeyraFilm } from "./product-film";
import { FILM } from "./story";

function Root() {
  return (
    <Composition
      id="VeyraFilm"
      component={VeyraFilm}
      width={FILM.width}
      height={FILM.height}
      fps={FILM.fps}
      durationInFrames={FILM.frames}
    />
  );
}
registerRoot(Root);
