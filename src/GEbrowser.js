/* 
 * This is a JS implementation of Grammatical Evolution (O'Neill and
 * Ryan, 1998, 2003), mostly intended for use in interactive EC web
 * apps. We provide an ask-tell interface suitable for interactive use
 * where the GE user is in control of the main loop.
 *
 * James McDermott <james.mcdermott@nuigalway.ie>
 *
 * Copyright James McDermott 2020
 * Licensed for use under GPL3
 *
 * This has only been tested under Node.
 *
 * sudo apt install node npm
 * npm install mathjs
 *
 * Some implementation/algorithm details follow:
 *
 * We represent an individual as a list [genome, phenotype,
 * used_codons, fitness].
 *
 * Crossover and mutation run inside the used region.
 *
 * We don't have sensible initialisation, but we have a cache
 * preventing duplicates from being added to the population. This
 * tends to prevent non-"sensible" outcomes at initialisation.
 *
 * Max codon size is set to LCM(rule lengths). This is much smaller
 * than the values of 100 or 1000 often used in research, but it
 * ensures that for every rule, every production is exactly equally
 * probable. Incrementing a codon is guaranteed to make a change. It
 * also gives us nice neat genomes.
 *
 * We have a maxdepth. When it is reached, we increment the codon
 * until we find a nonrecursive choice. (This change doesn't affect
 * the genome, but it is deterministic so it doesn't need to.)
 * Howver, we only detect direct recursion, not indirect.
 *
 * We require the user to write the grammar as a JSON object, eg:
 *
 {
  "<e>": [[ "(", "<e>", "<op>", "<e>", ")" ], [ "(", "<uop>", "<e>", ")"], [ "<var>" ]],
  "<var>": [["x"], ["y"]],
  "<op>": [["+"], [".*"]], // .* is used here to get element-wise multiplication, not matrix multiplication, in mathjs
  "<uop>": [["-"]]
  }

 * The first <> symbol is assumed to be the start symbol.
 *
 * We depend on lodash and mathjs for a few things.
 *
 * FIXME:
 * Not sure how to make this a proper module that can be imported
 * by other js files running in Node, or by webpages.
 *
 * I will collect here some canvas/processing/HTML5 possibilities for generative art:
 * https://p5js.org/
 * https://www.openprocessing.org/sketch/912094
 *
 * Compare to:
 * https://mutant.garden/
 * http://endlessforms.com/g/zuq4l4ld5i_0
 * 
 */


"use strict";
var mt = new MersenneTwister(); // we will seed it later

// this is the GE class. Usage is simple, examples at the bottom of
// the file.
class GE {
	constructor(fitness, // can be null else must have a Boolean .maximise member
				gram_file, 
				popsize,
				ngens,
				pmut, // FIXME add pxover?
				trunc,
				maxdepth,
				genomelength=200,
				seed=null) {

		if (fitness == null) {
			this.interactive = true;
			function dummy(x) {return 0;}
			dummy.maximise = true;
			this.fitness = dummy
		} else {
			this.interactive = false;
			this.fitness = fitness;
		}
		this.grammar = this.loadGrammar(gram_file);
		this.popsize = popsize;
		this.ngens = ngens;
		this.pmut = pmut;
		this.trunc = trunc;
		this.maxdepth = maxdepth;
		this.genomelength = genomelength;
		this.pop = new Array();
		this.cache = new Set();
		this.maxcodon = this.grammar.LCM;
		this.gen = 0;
		this.best_ever = null;
		
		if (!(seed === null)) {
			mt.seed(seed);
		}
	}

	init() {
		// initialise
		while (this.pop.length < this.popsize) {
			var g = this.random_ind(this.grammar, this.maxdepth);
			this.mapAndTryAddIndToPop(g, this.pop);
		}

	    // init value for best ever
	    this.best_ever = this.pop[0];
	    
	}

	mapAndTryAddIndToPop(g, pop) {
		var ind = this.mapGenomeToIndividual(g);
		if (ind != null) {
			// add to pop only if map is successful, else just try again
			let g, p, c, f;
			[g, p, c, f] = ind;
			if (!this.cache.has(p)) {
				this.cache.add(p);
				pop.push(ind);
			}
		}
	}		

	evolve() {
		// run generations
		for (this.gen = 0; this.gen < this.ngens; this.gen++) {
			var x = this.ask();
			// xi[1] is the phenotype
			this.tell(_.map(x, xi => this.fitness(xi[1])));
		}
		return this.best_ever;
	}

	print_statistics() {
	    // generation #, # evaluations, used codons, fit, phenotype
	    console.log(this.gen, (this.gen+1) * this.popsize, this.best_ever[2], this.best_ever[3], this.best_ever[1]); 
	    document.write(this.gen,". fitness(",this.best_ever[3], ") phenotype:", this.best_ever[1],"<br>");
	}

    describe_ind(ind) {
	// [genome, phenotype, used_codons, fitness]
	
	console.log("genome", ind[0].slice(0, ind[2]+1).toString());
	console.log("codons", ind[2]);
	console.log("fitness", ind[3]);
	console.log("phenotype", ind[1]);
	var s = ind[1];
	s = replaceAll(s, "x0", "x") // for human readers now
	s = replaceAll(s, ".*", "*");
	const node = math.parse(s);
	console.log("latex", node.toTex());
	console.log("simplified", math.simplify(s).toString());
    }
	

	truncation_selection() {
		return this.pop.slice(Math.floor(this.popsize * this.trunc), this.popsize-1);
	}

	direct_selection() {
		var parents = _.filter(this.pop, function(x) { return x[3] }); // fitness > 0
		if (parents.length == 0) {
			parents = this.pop;
		}
		return parents;
	}

	// we provide an ask-tell interface for interactive use.
	// create a GE object, ask for current population,
	// then tell GE the fitvals.
	ask() {
		return this.pop;
	}
	
	tell(fitvals) {

	    for (var i = 0; i < this.popsize; i++) {
			this.pop[i][3] = fitvals[i];
		}

		// update best ever
	    for (var i = 0; i < this.popsize; i++) {
		if ((this.fitness.maximise && this.pop[i][3] >= this.best_ever[3]) ||
		    (!this.fitness.maximise && this.pop[i][3] <= this.best_ever[3])) {
		    this.best_ever = this.pop[i];
		}
	    }
		this.print_statistics();
		
		
		if (this.interactive) {

			// just direct selection
			var parents = this.direct_selection();
			
		} else {
			
			// sort by fitness for truncation selection
			if (this.fitness.maximise) {
				this.pop = _.sortBy(this.pop, [function(x) { return x[3]}]);
			} else {
				this.pop = _.sortBy(this.pop, [function(x) { return -x[3]}]);
			}			
			var parents = this.truncation_selection();
		}


		// generational replacement
		this.pop = this.create_new_pop(parents);

	}

	create_new_pop(parents) {
		// create new empty pop and do elitism
        var newpop = [];
		newpop.push(this.pop[this.pop.length-1]);

		// fill up population using crossover and mutation
		var tries = 0;
        while (newpop.length < this.popsize) {

			if (tries > this.popsize * 2) {
				// we seem to be failing to create new individuals:
				// this can happen in interactive mode when number of
				// parents is small (eg user might select 1 or 2
				// parents or even 0) so many offspring are
				// duplicates. We just give up and create a random
				// ind.

				// we count each crossover (giving 2 children) as 2
				// tries, so if no duplicates ever occur we'll have
				// tries == popsize. We allow double that, then give
				// up.
				var g = this.random_ind();
				this.mapAndTryAddIndToPop(g, newpop);
				continue;
			}
				
			let g0, p0, c0, f0, g1, p1, c1, f1;
            [[g0, p0, c0, f0], [g1, p1, c1, f1]] = _.sampleSize(parents, 2);
            [g0, g1] = this.crossover(g0, g1, c0, c1);

			// first child
            if (mt.random() < this.pmut) {
                g0 = this.mutate(g0, c0);
			}
			this.mapAndTryAddIndToPop(g0, newpop);
			tries++;

			// second child
			if (newpop.length == this.popsize) {
				break;
			}
            if (mt.random() < this.pmut) {
                g1 = this.mutate(g1, c1);
			}
			this.mapAndTryAddIndToPop(g1, newpop);

			tries++;
		}
		return newpop;
	}
	

	// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*
	// enumerate and maintain internal state
	* genomeIterator(g) {
		for (var i = 0; i < g.length; i++) {
			yield [i, g[i]]; 
		}
	}

	random_ind() {
		// returns a random genome
		var ind = [];
		for (var i = 0; i < this.genomelength; i++) {
			ind.push(randrange(this.maxcodon));
		}
		return ind;
	}
	
	mutate(g, c) {
		// bit-flip mutation, works on genomes, in used-codons section
		var idx = randrange(c);
		g[idx] = randrange(this.maxcodon);
		return g;
	}
	
	crossover(g0, g1, c0, c1) {
		// works on genomes
		var c = Math.min(c0, c1);
		var idx = randrange(c); // work on the used-codons sections of both.
		var t0 = _.concat(g0.slice(0, idx), g1.slice(idx, g1.length));
		var t1 = _.concat(g1.slice(0, idx), g0.slice(idx, g0.length));
		return [t0, t1];
	}

	looseJsonParse(obj) {
		// parse a string containing a JSON object 
		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval
		// FIXME use JSON.parse intead? https://www.sitepoint.com/call-javascript-function-string-without-using-eval/
		return Function('"use strict";return (' + obj + ')')();
	}
	
	loadFile(filename) {
		// just read a file as plain text
	        // https://stackoverflow.com/a/40200549/86465
//	        var buffer = fs.readFileSync(filename);
//		return buffer.toString();
	}

	getTerminals(obj) {
		// create a Set containing the terminal symbols of the grammar
		var s = new Set();
		for (const [ lhs, rhs ] of Object.entries(obj)) {
			for (var prod of rhs) { // of: iterate over array
				for (var sym of prod) {
					if (!(sym.startsWith("<") && sym.endsWith(">"))) {
						s.add(sym);
					}
				}
			}
		}
		return s;
	}

	getRecursiveNTs(obj) {
		// create a Set containing the recurisve non-terminal symbols of the grammar
		var s = new Set();
		for (const [ lhs, rhs ] of Object.entries(obj)) {
			var recursive = false;
			for (var prod of rhs) { // of: iterate over array
				for (var sym of prod) {
					if (lhs == sym) {
						recursive = true;
					}
				}
			}
			if (recursive) {
				s.add(lhs)
			}			
		}
		return s;
	}

	loadGrammar(filename) {
	    // given a filename, load and parse the grammar and get some useful information about it
		
	    //var s = this.loadFile(filename);
	    var s = filename;
	    var startIdx = s.indexOf("<");
	    var endIdx = s.indexOf(">"); // we take the first NT as the start symbol
	    var start_sym = s.slice(startIdx, endIdx+1);
	    var obj = this.looseJsonParse(s);
	    return {
		"rules": obj,
		"nonterminals": new Set(Object.keys(obj)),
		"terminals": this.getTerminals(obj),
		"recursive_NTs": this.getRecursiveNTs(obj), // useful for dealing with maxdepth
		"start_rule": start_sym,
		"LCM": this.getGrammarLCM(obj) // we will use this for max codon size
	    };
	}

	getGrammarLCM(obj) {
		// least common multiple of the lengths of productions in the grammar
		// (ie numbers of rules)
		var rule_lengths = [];
		for (const [ lhs, rhs ] of Object.entries(obj)) {
			rule_lengths.push(rhs.length);
		}
		return lcmAll(rule_lengths);
	}
	
	mapGenomeToIndividual(g) {
		// given g, return [g, p, c, f]. but return null if we run out of codons
		let i, p, c, f;
		i = this.genomeIterator(g)
		p = this.mapGenomeToPhenotype(i, 0);
		if (p == null) {
			return null;
		}
		c = i.next().value[0] - 1; // subtract 1
		f = null; // we set it later
		return [g, p, c, f];
	}

	mapGenomeToPhenotype(g, depth, s=null) {
		// map g to p
		
		// g is a genome enumerator/iterator
		// depth is the current depth, starting at 0
		// s is the current symbol to be expanded
		if (s == null) {
			s = this.grammar.start_rule;
		}
		// console.log("s", s);
		var r = this.grammar.rules[s];
		var tmp = g.next();
		if (tmp.done == true) {
			return null;
		}

		// console.log("r", r);
		let codon, idx;
		[idx, codon] = tmp.value; // we enumerate, getting idx and codon
		// console.log("codon", codon);
		
		var p = r[codon % r.length]; // the mod rule
		if ((depth >= this.maxdepth) && (this.grammar.recursive_NTs.has(s))) {
			// we have to choose a nonrecursive production
			while (p.indexOf(s) != -1) {
				// try next codon value until we find a production p that doesn't recurse directly to s
				codon = (codon + 1) % this.maxcodon; 
				p = r[codon % r.length]; // the mod rule
			}
			// console.log("altered codon", codon);
		} // FIXME we could implement a mindepth here too in the same way?

		var d = [];
		// console.log("p", p);
		for (var i = 0; i < p.length; i++) {
			if (this.grammar.terminals.has(p[i])) {
				// terminal => just append
				// console.log("just pushing", p[i]);
				d.push(p[i]);
			} else {
				// nonterminal => recurse
				let str, used_codons;
				// console.log("recursing with", p[i]);
				str = this.mapGenomeToPhenotype(g, depth+1, p[i]);
				if (str == null) {
					return null;
				}
				d.push(str);
			}
		}

		return d.join("");
	}
}


function randrange(n) {
	return mt.int() % n;
}

function random_choice(L) {
	var i = randrange(L.length);
	return L[i];
}


// https://stackoverflow.com/a/61352020/86465
const gcd = (a, b) => b == 0 ? a : gcd (b, a % b)
const lcm = (a, b) =>  a / gcd (a, b) * b
const lcmAll = (ns) => ns .reduce (lcm, 1)

function replaceAll(s, a, b) {
    while (s.indexOf(a) != -1) {
	s = s.replace(a, b);
    }
    return s;
}



function countOccurences(haystack, needle) {
	var regExp = new RegExp(needle, "gi");
	return (haystack.match(regExp) || []).length;
}

function count_and(ind) {
    // A toy fitness: maximise the number of occurrences of 'and'.
	[g, p] = ind;
    return countOccurences(p, "and");
}
count_and.maximise = true;

function onemax(x) {
	[g, p] = x;
	return g.reduce((a, b) => a + b, 0);
}
onemax.maximise = true;

function lenmax(s) {
	return s.length;
}
lenmax.maximise = true;

function RMSE(x, y) {
	const z = math.subtract(x, y);
	return RMS(z);
}

function RMS(x) {
	return math.sqrt(math.sum(math.square(x)));
}	

function sr_quartic(s) {
    // notice using math.js evaluate we can use +, -
    // for elementwise addition, subtraction, but .* and .^
    // for elementwise multiplication and power. (but the function
    // would be called dotMultiply)
    function target(x) {
	return math.add(x, math.dotPow(x, 2), math.dotPow(x, 3), math.dotPow(x, 4));
    }
    var X = math.matrix([[0.0], [0.1], [0.2], [0.3], [0.4], [0.5]]);
    // console.log("s", s);
    var fX = math.evaluate(s, {"x0": X}); // could use  {"x0": X[0], etc if needed}
    // console.log("fX", fX);
    var y = target(X);
    // console.log("y", y);
    var f = RMSE(fX, y);
    // console.log("f", f);
    return f;
}	
sr_quartic.maximise = false;

function test_run(grammar) {
    // constructor(fitness,
    // 			gram_file, 
    // 			popsize,
    // 			ngens,
    // 			pmut,
    // 			trunc,
    // 			maxdepth,
    // 			genomelength=200,
    // 			seed=null)	
    document.write("GEjs - test_run()...<br>");
    //    var ge = new GE(sr_quartic, "sr_grammar.json", 50, 10, 0.2, 0.3, 6);
    document.write("The grammar loaded is:<br>",grammar,"<br>");
    document.write("GEjs starting...<br>");
    
    var ge = new GE(sr_quartic, grammar, 50, 10, 0.2, 0.3, 6);
    ge.init();
    var best_ever = ge.evolve();
    ge.describe_ind(best_ever);
    document.write("Fin!<br><br> test_run():best_ever: ",best_ever[1],"<hr>");
}

function test_interactive_run(grammar) {
    // in an interactive setting, we use an "ask-tell" interface.
    // we can pass null as the fitness. 
    // truncation proportion will be ignored as we will use
    // direct selection of the parents that we tell have fitness = 1.
    // n generations will also be ignored.
    document.write("GEjs - test_interactive_run()...<br>");
    //    var ge = new GE(null, "sr_grammar.json", 10, 5, 0.2, 0.3, 6);
    var ge = new GE(null, grammar, 10, 5, 0.2, 0.3, 6);
    ge.init();
    for (var i = 0; i < 5; i++) {
	var x = ge.ask();
	// we can integrate this into an event loop or whatever.
	// we "tell" GE the fitvals that we get from the UI
	ge.tell([1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
    }
    document.write("Fin!<br><br> test_interactive_run():best_ever: ",ge.best_ever[1],"<hr>");
}
	
