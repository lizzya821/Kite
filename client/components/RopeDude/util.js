export const generateTargetWord = () => {
  const words = ["Fullstack", "Chicago", "Cheese", "Popcorn", ""];
  const targetWord = words[Math.floor(Math.random() * words.length - 1)];
  return targetWord.toUpperCase();
  // let { data } = await axios.get(
  //   "https://wordsapiv1.p.rapidapi.com/words/?lettersMin=12random=true",
  //   {
  //     headers: {
  //       "x-rapidapi-host": "wordsapiv1.p.rapidapi.com",
  //       "x-rapidapi-key": "78dc5262e8msh00adb59c72b136ap136fb3jsne36baffcbcdf"
  //     }
  //   }
  // );
  // console.log("DATA", data);
  // return data;
};

export const generateWordObj = word => {
  let wordObj = {};
  word
    .toUpperCase()
    .split("")
    .forEach((letter, idk) => {
      if (wordObj[letter]) {
        wordObj[letter].push(idk);
      } else {
        wordObj[letter] = [idk];
      }
    });
  return wordObj;
};

//CHEESE:
// { C: [ 0 ],
//   H: [ 1 ],
//   E: [ 2, 3, 5 ],
//   S: [ 4 ] }

export const displayIt = (letterBankArr, target) => {
  const wordObj = generateWordObj(target);
  let displayed = "#".repeat(target.length);

  letterBankArr.forEach(letter => {
    if (wordObj[letter.toUpperCase()]) {
      const indices = wordObj[letter.toUpperCase()];
      indices.forEach(idx => {
        displayed =
          displayed.substring(0, idx) + letter + displayed.substring(idx + 1);
      });
    }
  });
  return displayed;
};

export const remainingLetters = letterBankArr => {
  let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  letterBankArr.forEach(guessed => {
    alphabet = alphabet
      .split("")
      .filter(letter => letter !== guessed)
      .join("");
  });
  return alphabet;
};
