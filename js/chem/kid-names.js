/**
 * kid-names.js — the collection book's hand-written molecules: a kid
 * name and a fun fact for each, to read out loud.
 *
 * Each one is written in SMILES (see smiles.js), so the room can work
 * out its label and spot it when Caleb builds it. `step` says which page
 * of the book it's on: the unlock step whose atoms it needs.
 *
 * Every molecule here must fit on the board and be in data/molecules.json
 * (tests/chem-data.test.js checks), so Caleb can really build them all.
 *
 * 🧪 Try this! Add a molecule you like. Find its SMILES on PubChem
 *    (pubchem.ncbi.nlm.nih.gov), and run `npm test` to check it fits.
 */

/** @type {{smiles: string, name: string, fact: string, step: number}[]} */
export const KID_MOLECULES = [
  // ---- Step 1: ⚪ H and 🔴 O ----
  { step: 1, smiles: '[H][H]', name: 'Hydrogen', fact: 'The lightest stuff there is. The Sun is mostly hydrogen!' },
  { step: 1, smiles: 'O=O', name: 'Oxygen', fact: 'The part of the air you breathe in. Your body needs it every minute.' },
  { step: 1, smiles: 'O', name: 'Water', fact: 'Two hydrogens holding hands with one oxygen. You are more than half water!' },
  { step: 1, smiles: 'OO', name: 'Hydrogen peroxide', fact: 'Fizzes on a scraped knee to clean it.' },

  // ---- Step 2: ⚫ C joins ----
  { step: 2, smiles: 'C', name: 'Methane', fact: 'The gas in a gas stove. Cows burp lots of it!' },
  { step: 2, smiles: 'CC', name: 'Ethane', fact: 'Two carbons holding hands, with hydrogens all around.' },
  { step: 2, smiles: 'CCC', name: 'Propane', fact: 'The gas in a barbecue grill tank.' },
  { step: 2, smiles: 'CCCC', name: 'Butane', fact: 'The fuel inside a lighter.' },
  { step: 2, smiles: 'CCCCC', name: 'Pentane', fact: 'A runny liquid that dries up super fast.' },
  { step: 2, smiles: 'CCCCCC', name: 'Hexane', fact: 'Six carbons in a row. Used to squeeze oil out of seeds.' },
  { step: 2, smiles: 'CCCCCCCC', name: 'Octane', fact: 'Part of the gasoline in a car. Eight carbons long!' },
  { step: 2, smiles: 'O=C=O', name: 'Carbon dioxide', fact: 'The fizz in soda. You breathe it out, and plants breathe it in.' },
  { step: 2, smiles: 'C=C', name: 'Ethylene', fact: 'Bananas give it off, and it helps fruit get ripe.' },
  { step: 2, smiles: 'CC=C', name: 'Propylene', fact: 'Becomes the plastic in lots of food boxes.' },
  { step: 2, smiles: 'C#C', name: 'Acetylene', fact: 'Burns so hot it can cut through metal!' },
  { step: 2, smiles: 'CC#C', name: 'Propyne', fact: 'A carbon chain with a triple bond: three sticks!' },
  { step: 2, smiles: 'C=CC=C', name: 'Butadiene', fact: 'Used to make the rubber in tires.' },
  { step: 2, smiles: 'CC(=C)C=C', name: 'Isoprene', fact: 'Trees give off so much of it on hot days that it makes a blue haze.' },
  { step: 2, smiles: 'C=C=O', name: 'Ketene', fact: 'A very jumpy molecule that grabs onto other things fast.' },
  { step: 2, smiles: 'CO', name: 'Methanol', fact: 'Windshield washer fluid. Poison: never drink it!' },
  { step: 2, smiles: 'CCO', name: 'Alcohol', fact: 'The alcohol in hand sanitizer.' },
  { step: 2, smiles: 'CC(C)O', name: 'Rubbing alcohol', fact: 'Feels cold on your skin because it dries so fast.' },
  { step: 2, smiles: 'OCCO', name: 'Antifreeze', fact: 'Keeps car engines from freezing in winter.' },
  { step: 2, smiles: 'OCC(O)CO', name: 'Glycerol', fact: 'Sweet and gooey. It is in soap and toothpaste.' },
  { step: 2, smiles: 'COC', name: 'Dimethyl ether', fact: 'Same atoms as alcohol, holding hands a different way. A whole different molecule!' },
  { step: 2, smiles: 'C=O', name: 'Formaldehyde', fact: 'Scientists use it to keep old animal specimens from rotting.' },
  { step: 2, smiles: 'CC=O', name: 'Acetaldehyde', fact: 'Gives ripe apples part of their smell.' },
  { step: 2, smiles: 'OCC=O', name: 'Glycolaldehyde', fact: 'A tiny sugar that astronomers found floating in outer space!' },
  { step: 2, smiles: 'OCC(O)C=O', name: 'Glyceraldehyde', fact: 'A simple sugar with just three carbons.' },
  { step: 2, smiles: 'OCC(=O)CO', name: 'Dihydroxyacetone', fact: 'The stuff in sunless tanning lotion that turns skin brown.' },
  { step: 2, smiles: 'CC(C)=O', name: 'Acetone', fact: 'Nail polish remover. It smells strong!' },
  { step: 2, smiles: 'CC(=O)C(C)=O', name: 'Diacetyl', fact: 'Gives butter its buttery smell.' },
  { step: 2, smiles: 'OC=O', name: 'Formic acid', fact: 'What makes an ant bite sting!' },
  { step: 2, smiles: 'CC(=O)O', name: 'Vinegar', fact: 'Acetic acid: the sour in vinegar.' },
  { step: 2, smiles: 'CCC(=O)O', name: 'Propionic acid', fact: 'Made by the bacteria that put holes in Swiss cheese.' },
  { step: 2, smiles: 'CCCC(=O)O', name: 'Butyric acid', fact: 'Smells like rancid butter and stinky cheese. Pee-yew!' },
  { step: 2, smiles: 'OC(=O)O', name: 'Carbonic acid', fact: 'Forms when fizz dissolves in soda. It makes soda a little sour.' },
  { step: 2, smiles: 'OC(=O)C(=O)O', name: 'Oxalic acid', fact: 'In rhubarb leaves and spinach.' },
  { step: 2, smiles: 'CC(O)C(=O)O', name: 'Lactic acid', fact: 'Makes yogurt sour.' },
  { step: 2, smiles: 'CCOC(C)=O', name: 'Ethyl acetate', fact: 'Smells like pear drops and nail polish.' },
  { step: 2, smiles: 'CCCCCC=O', name: 'Hexanal', fact: 'Part of the smell of freshly cut grass.' },
  { step: 2, smiles: 'C1CCC1', name: 'Cyclobutane', fact: 'Four carbons holding hands in a square ring.' },
  { step: 2, smiles: 'C1=CC=CC=C1', name: 'Benzene', fact: 'A ring of six carbons. Its smell is sweet, but it is poisonous.' },
  { step: 2, smiles: 'CC1=CC=CC=C1', name: 'Toluene', fact: 'In paint thinner. Smells like markers.' },
  { step: 2, smiles: 'CC1=CC=CC=C1C', name: 'Xylene', fact: 'Used to clean paint brushes.' },
  { step: 2, smiles: 'OC1=CC=CC=C1', name: 'Phenol', fact: 'One of the first germ killers ever used in hospitals.' },
  { step: 2, smiles: 'OC1=CC=CC=C1O', name: 'Catechol', fact: 'Helps turn a cut apple brown.' },
  { step: 2, smiles: 'OC1=CC=C(O)C=C1', name: 'Hydroquinone', fact: 'Bombardier beetles mix it to spray a hot, stinky blast at enemies!' },
  { step: 2, smiles: 'O=CC1=CC=CC=C1', name: 'Benzaldehyde', fact: 'Smells like almonds and cherries.' },
  { step: 2, smiles: 'C=CC1=CC=CC=C1', name: 'Styrene', fact: 'Becomes Styrofoam, the white foam in cups and packing.' },
  { step: 2, smiles: 'O=C1C=CC(=O)C=C1', name: 'Quinone', fact: 'A ring with two oxygens. Bugs use it to taste yucky.' },

  // ---- Step 3: 🔵 N joins ----
  { step: 3, smiles: 'N#N', name: 'Nitrogen', fact: 'Most of the air is nitrogen! Its triple bond is super strong.' },
  { step: 3, smiles: 'N', name: 'Ammonia', fact: 'Has a strong cleaner smell. Farmers use it to help plants grow.' },
  { step: 3, smiles: 'NN', name: 'Hydrazine', fact: 'Rocket fuel that steers spaceships!' },
  { step: 3, smiles: 'NO', name: 'Hydroxylamine', fact: 'A little nitrogen and oxygen pair that chemists build with.' },
  { step: 3, smiles: 'C#N', name: 'Hydrogen cyanide', fact: 'Very poisonous, but found in comet tails!' },
  { step: 3, smiles: 'CN', name: 'Methylamine', fact: 'Smells fishy.' },
  { step: 3, smiles: 'CC#N', name: 'Acetonitrile', fact: 'Found in space, around baby stars.' },
  { step: 3, smiles: 'C=CC#N', name: 'Acrylonitrile', fact: 'Made into cozy fake-wool sweaters.' },
  { step: 3, smiles: 'C#CC#N', name: 'Cyanoacetylene', fact: 'One of the molecules found in the clouds between the stars.' },
  { step: 3, smiles: 'NC=O', name: 'Formamide', fact: 'Some scientists think life might have started with it.' },
  { step: 3, smiles: 'NC(N)=O', name: 'Urea', fact: 'It is in pee! It also feeds plants.' },
  { step: 3, smiles: 'NC(N)=N', name: 'Guanidine', fact: 'Three nitrogens around one carbon. Muscles make something like it.' },
  { step: 3, smiles: 'NCC(=O)O', name: 'Glycine', fact: 'The smallest building block of proteins. Found on a comet!' },
  { step: 3, smiles: 'CC(N)C(=O)O', name: 'Alanine', fact: 'A protein building block. Silk is full of it.' },
  { step: 3, smiles: 'OCC(N)C(=O)O', name: 'Serine', fact: 'A protein building block your body can make by itself.' },
  { step: 3, smiles: 'NCCCCN', name: 'Putrescine', fact: 'Smells like rotting meat. Yuck!' },
  { step: 3, smiles: 'NCCCCCN', name: 'Cadaverine', fact: 'Another rotten smell. Even worse!' },
  { step: 3, smiles: 'NC1=CC=CC=C1', name: 'Aniline', fact: 'Used to make the first purple dye made in a lab.' },
  { step: 3, smiles: 'C1=CC=NC=C1', name: 'Pyridine', fact: 'Like benzene, but one carbon swapped for a nitrogen. Smells awful!' },

  // ---- Step 4: 🟢 Cl and 🟡 S join ----
  { step: 4, smiles: 'ClCl', name: 'Chlorine', fact: 'A yellow-green gas. A little bit keeps pool water clean.' },
  { step: 4, smiles: 'Cl', name: 'Hydrochloric acid', fact: 'Your stomach makes it to break down food!' },
  { step: 4, smiles: 'OCl', name: 'Hypochlorous acid', fact: 'The germ-killer that bleach makes when it mixes with water.' },
  { step: 4, smiles: 'NCl', name: 'Chloramine', fact: 'The "pool smell" is really chloramine.' },
  { step: 4, smiles: 'CCl', name: 'Methyl chloride', fact: 'Seaweed and fungi make it.' },
  { step: 4, smiles: 'ClCCl', name: 'Dichloromethane', fact: 'Takes the caffeine out of coffee beans.' },
  { step: 4, smiles: 'ClC(Cl)Cl', name: 'Chloroform', fact: 'Long ago, doctors used it to make people sleep for operations.' },
  { step: 4, smiles: 'ClC(Cl)(Cl)Cl', name: 'Carbon tetrachloride', fact: 'Four chlorines all around one carbon.' },
  { step: 4, smiles: 'C=CCl', name: 'Vinyl chloride', fact: 'Becomes PVC, the plastic in white water pipes.' },
  { step: 4, smiles: 'S', name: 'Hydrogen sulfide', fact: 'Smells like rotten eggs!' },
  { step: 4, smiles: 'CS', name: 'Methanethiol', fact: 'Part of the smell of bad breath and toots!' },
  { step: 4, smiles: 'CCS', name: 'Ethanethiol', fact: 'Added to gas on purpose, so you can smell a leak.' },
  { step: 4, smiles: 'C=CCS', name: 'Allyl mercaptan', fact: 'Why garlic breath smells like garlic.' },
  { step: 4, smiles: 'CSC', name: 'Dimethyl sulfide', fact: 'The smell of the seaside!' },
  { step: 4, smiles: 'CSSC', name: 'Dimethyl disulfide', fact: 'Part of the smell of cooked cabbage.' },
  { step: 4, smiles: 'S=C=S', name: 'Carbon disulfide', fact: 'Like carbon dioxide, but with sulfurs instead of oxygens.' },
  { step: 4, smiles: 'O=C=S', name: 'Carbonyl sulfide', fact: 'Found in volcano gas and in outer space.' },
  { step: 4, smiles: 'ClSCl', name: 'Sulfur dichloride', fact: 'A red liquid used to make rubber tough.' },
  { step: 4, smiles: 'NC(CS)C(=O)O', name: 'Cysteine', fact: 'A protein building block. Hair and nails are full of it.' },
];
