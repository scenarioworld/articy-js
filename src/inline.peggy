/**
 * PeggyJS Grammer for evaluating embedded scripts and lists in display text.
 * Language follows the syntax of Inkle Ink lists and embedded value prints.
*/

{{
import { processEmbed, SequenceType, IEmbedScriptParseOptions, ExprEmbedType, SequenceEmbedType, Argument } from "./inline_util";
}}

{
if(false) { 
	location();
	error("");
	peg$anyExpectation();
}
}

// Root rule: Source text is a list of text and embedded script
Source = contents:(Text / Embed)* { return contents.join(''); }
InlineSource = contents:(InlineText / Embed)+ { return contents.join(''); }
InlineMultilineSource = contents:(InlineMultilineText / Embed)+ { return contents.join(''); }

// An embed is either inline or multi-line
Embed = InlineEmbed / MutliLineEmbed;

// An inline embed. Ex. {~Hi|Hello|Heyo}
InlineEmbed 
	= '{' type:(Condition / Type)? args:Arguments '}' { 
		return processEmbed(type, args, false, options as IEmbedScriptParseOptions, expected);
    }

Whitespace = [ \t\n\r]* { return undefined; }
Newline = '\r'? '\n' { return undefined; }
MutliLineEmbed
	= '{' type:Type? Newline args:MultiLineArguments '}' { 
		return processEmbed(type, args, true, options as IEmbedScriptParseOptions, expected);
	}

// Embed type. Is either one of the four list types or a condition
Type = Stopping_Id / Shuffle_Id / Cycle_Id / Once_Only_Id
Stopping_Id = 'stopping:' { return {type: SequenceType.Stopping}; }
Shuffle_Id = ('~' / 'shuffle:') { return {type: SequenceType.Shuffle}; }
Cycle_Id = ('&' / 'cycle:') { return {type: SequenceType.Cycle}; }
Once_Only_Id = ('!' / 'once:') { return {type: SequenceType.OnlyOnce}; }

// A condition is an expression followed by a colon
Condition = expr:Expression ':' Whitespace { return {"expr": expr, "text": text()}; }
Expression = [^\n|:{}]+ { return text(); }

// List of arguments. For inline, they're separated by pipes (|)
Argument = arg:InlineSource? { return { full: arg ?? '', location: location() }; }
Arguments 
	= first:Argument rest:('|' Argument)* {
		const result: Argument[] = [];
		if(first) { result.push(first); }
		for(let i = 0; i < rest.length; i++) { 
			result.push(rest[i][1]);
		}
    	return result;
	}

// Multi-line argument lists have each entry begin with a dash
MultilineArgument = cond:Condition? value:InlineMultilineSource? { 
	if(cond !== null) { 
		return {expr: cond.expr, value: value ?? '', full: cond.text + (value ?? ''), location: location() };
	} else { 
		return { full: value ?? '', location: location() };
	}
}
MultiLineArguments = Whitespace args:('-' Whitespace MultilineArgument Whitespace)+ { 
	const result: Argument[] = [];
	for(let i = 0; i < args.length; i++) { 
		result.push(args[i][2]);
	}
	return result;
}

InlineMultilineText = [^{}-]+ { return text().trim(); }
InlineText = [^{}|\r\n]+ { return text(); }
Text = [^{}]+ { return text(); }