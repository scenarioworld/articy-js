/**
 * PeggyJS Grammer for evaluating embedded scripts and lists in display text.
 * Language follows the syntax of Inkle Ink lists and embedded value prints.
*/

{{
import { processEmbed, SequenceType, IEmbedScriptParseOptions, ExprEmbedType, SequenceEmbedType } from "./inline_util";
}}

{
if(false) { 
	location();
	expected("");
	error("");
	peg$anyExpectation();
}
}

// Root rule: Source text is a list of text and embedded script
Source = contents:(Text / Embed)* { return contents.join(''); }
EmbedSource = contents:(EmbedText / Embed)+ { return contents.join('') }

// An embed is either inline or multi-line
Embed = InlineEmbed;

// An inline embed. Ex. {~Hi|Hello|Heyo}
InlineEmbed 
	= '{' type:Type? args:Arguments '}' { 
		return processEmbed(type, args, options as IEmbedScriptParseOptions);
    }

// Embed type. Is either one of the four list types or a condition
Type = Stopping_Id / Shuffle_Id / Cycle_Id / Condition / Once_Only_Id
Stopping_Id = 'stopping:' { return {type: SequenceType.Stopping}; }
Shuffle_Id = ('~' / 'shuffle:') { return {type: SequenceType.Shuffle}; }
Cycle_Id = ('&' / 'cycle:') { return {type: SequenceType.Cycle}; }
Once_Only_Id = ('!' / 'once:') { return {type: SequenceType.OnlyOnce}; }

// A condition is an expression followed by a colon
Condition = expr:Expression ':' { return {"expr": expr}; }
Expression = [^\n|:{}]+ { return text(); }

// List of arguments. For inline, they're separated by pipes (|)
Arguments 
	= first:EmbedSource? rest:('|' EmbedSource?)* {
		const result: string[] = [];
		if(first) { result.push(first); }
		for(let i = 0; i < rest.length; i++) { 
			result.push(rest[i][1]);
		}
    	return result;
	}

EmbedText = [^{}|]+ { return text(); }
Text = [^{}]+ { return text(); }