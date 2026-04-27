package redlib.backend.utils;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.jsoup.nodes.TextNode;
import org.jsoup.parser.Tag;
import org.jsoup.safety.Cleaner;
import org.jsoup.safety.Safelist;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class NotebookRichTextUtils {
    private static final Pattern FONT_SIZE_PATTERN = Pattern.compile("^(\\d+)px$");
    private static final Safelist SAFE_LIST = Safelist.none()
            .addTags("h1", "p", "strong", "em", "u", "span", "br")
            .addAttributes("h1", "style")
            .addAttributes("p", "style")
            .addAttributes("strong", "style")
            .addAttributes("em", "style")
            .addAttributes("u", "style")
            .addAttributes("span", "style");

    private NotebookRichTextUtils() {
    }

    public static SanitizedRichText sanitizeRichContent(String richContent) {
        String normalizedInput = trimToNull(richContent);
        if (normalizedInput == null) {
            return new SanitizedRichText("", "");
        }

        Document dirtyDocument = Jsoup.parseBodyFragment(normalizedInput);
        dirtyDocument.outputSettings().prettyPrint(false);
        validateUnsafeContent(dirtyDocument.body());

        Document cleanedDocument = new Cleaner(SAFE_LIST).clean(dirtyDocument);
        cleanedDocument.outputSettings().prettyPrint(false);

        Document normalizedDocument = Document.createShell("");
        normalizedDocument.outputSettings().prettyPrint(false);
        appendNormalizedChildren(cleanedDocument.body(), normalizedDocument.body());

        String sanitizedHtml = normalizedDocument.body().html();
        String plainText = extractPlainText(normalizedDocument.body());
        return new SanitizedRichText(plainText, sanitizedHtml);
    }

    public static String fallbackRichContentFromPlainText(String plainText) {
        String normalizedPlainText = normalizePlainText(plainText);
        if (normalizedPlainText.isEmpty()) {
            return "";
        }

        StringBuilder builder = new StringBuilder();
        String[] paragraphs = normalizedPlainText.split("\\n\\s*\\n");
        for (String paragraph : paragraphs) {
            if (builder.length() > 0) {
                builder.append('\n');
            }
            builder.append("<p>");
            String[] lines = paragraph.split("\\n", -1);
            for (int i = 0; i < lines.length; i++) {
                if (i > 0) {
                    builder.append("<br>");
                }
                builder.append(escapeHtml(lines[i]));
            }
            builder.append("</p>");
        }
        return builder.toString();
    }

    private static void validateUnsafeContent(Element body) {
        for (Element element : body.getAllElements()) {
            if ("script".equals(tagName(element))) {
                throw new IllegalArgumentException("Script tags are not allowed");
            }
            element.attributes().forEach(attribute -> {
                String key = attribute.getKey().toLowerCase(Locale.ROOT);
                String value = attribute.getValue().toLowerCase(Locale.ROOT);
                if (key.startsWith("on")) {
                    throw new IllegalArgumentException("Event handler attributes are not allowed");
                }
                if (value.contains("javascript:")) {
                    throw new IllegalArgumentException("javascript: URLs are not allowed");
                }
            });
        }
    }

    private static void appendNormalizedChildren(Element sourceBody, Element targetBody) {
        Element currentParagraph = null;
        for (Node child : new ArrayList<>(sourceBody.childNodes())) {
            if (isIgnorableTextNode(child)) {
                continue;
            }
            if (child instanceof Element element && isBlockTag(tagName(element))) {
                if (hasMeaningfulContent(currentParagraph)) {
                    targetBody.appendChild(currentParagraph);
                    currentParagraph = null;
                }
                Element blockElement = cloneBlockElement(element);
                if (hasMeaningfulContent(blockElement)) {
                    targetBody.appendChild(blockElement);
                }
            } else {
                if (currentParagraph == null) {
                    currentParagraph = new Element(Tag.valueOf("p"), "");
                }
                appendInlineNode(child, currentParagraph);
            }
        }
        if (hasMeaningfulContent(currentParagraph)) {
            targetBody.appendChild(currentParagraph);
        }
    }

    private static Element cloneBlockElement(Element source) {
        Element target = new Element(Tag.valueOf(tagName(source)), "");
        applySanitizedStyle(source, target);
        for (Node child : source.childNodes()) {
            appendInlineNode(child, target);
        }
        return target;
    }

    private static void appendInlineNode(Node source, Element targetParent) {
        if (source instanceof TextNode textNode) {
            String text = textNode.getWholeText();
            if (!text.isBlank()) {
                targetParent.appendText(text);
            }
            return;
        }
        if (!(source instanceof Element element)) {
            return;
        }

        String tagName = tagName(element);
        if ("br".equals(tagName)) {
            targetParent.appendElement("br");
            return;
        }
        if (isInlineTag(tagName)) {
            Element inlineElement = new Element(Tag.valueOf(tagName), "");
            applySanitizedStyle(element, inlineElement);
            for (Node child : element.childNodes()) {
                appendInlineNode(child, inlineElement);
            }
            if (hasMeaningfulContent(inlineElement)) {
                targetParent.appendChild(inlineElement);
            }
            return;
        }

        for (Node child : element.childNodes()) {
            appendInlineNode(child, targetParent);
        }
    }

    private static void applySanitizedStyle(Element source, Element target) {
        String sanitizedStyle = sanitizeStyle(source.attr("style"));
        if (!sanitizedStyle.isEmpty()) {
            target.attr("style", sanitizedStyle);
        }
    }

    private static String sanitizeStyle(String style) {
        if (style == null || style.isBlank()) {
            return "";
        }

        Map<String, String> sanitizedStyles = new LinkedHashMap<>();
        String[] declarations = style.split(";");
        for (String declaration : declarations) {
            int separatorIndex = declaration.indexOf(':');
            if (separatorIndex < 0) {
                continue;
            }
            String property = declaration.substring(0, separatorIndex).trim().toLowerCase(Locale.ROOT);
            String value = declaration.substring(separatorIndex + 1).trim();
            switch (property) {
                case "font-family" -> {
                    String normalizedFont = normalizeFontFamily(value);
                    if (normalizedFont != null) {
                        sanitizedStyles.put(property, normalizedFont);
                    }
                }
                case "font-size" -> {
                    String normalizedSize = normalizeFontSize(value);
                    if (normalizedSize != null) {
                        sanitizedStyles.put(property, normalizedSize);
                    }
                }
                case "text-align" -> {
                    String normalizedAlign = normalizeTextAlign(value);
                    if (normalizedAlign != null) {
                        sanitizedStyles.put(property, normalizedAlign);
                    }
                }
                default -> {
                }
            }
        }

        return sanitizedStyles.entrySet().stream()
                .map(entry -> entry.getKey() + ":" + entry.getValue())
                .reduce((left, right) -> left + "; " + right)
                .orElse("");
    }

    private static String normalizeFontFamily(String fontFamily) {
        String[] candidates = fontFamily.split(",");
        for (String candidate : candidates) {
            String normalizedCandidate = candidate.trim()
                    .replace("\"", "")
                    .replace("'", "")
                    .toLowerCase(Locale.ROOT);
            switch (normalizedCandidate) {
                case "microsoft yahei", "microsoft yahei ui", "微软雅黑" -> {
                    return "Microsoft YaHei";
                }
                case "simsun", "宋体" -> {
                    return "SimSun";
                }
                case "simhei", "黑体" -> {
                    return "SimHei";
                }
                case "kaiti", "楷体" -> {
                    return "KaiTi";
                }
                case "monospace", "等宽字体" -> {
                    return "monospace";
                }
                default -> {
                }
            }
        }
        return null;
    }

    private static String normalizeFontSize(String fontSize) {
        Matcher matcher = FONT_SIZE_PATTERN.matcher(fontSize.toLowerCase(Locale.ROOT));
        if (!matcher.matches()) {
            return null;
        }
        int size = Integer.parseInt(matcher.group(1));
        if (size < 10 || size > 72) {
            return null;
        }
        return size + "px";
    }

    private static String normalizeTextAlign(String textAlign) {
        String normalizedTextAlign = textAlign.toLowerCase(Locale.ROOT);
        return switch (normalizedTextAlign) {
            case "left", "center", "right" -> normalizedTextAlign;
            default -> null;
        };
    }

    private static String extractPlainText(Element body) {
        List<String> blocks = new ArrayList<>();
        for (Node child : body.childNodes()) {
            String text = normalizePlainText(extractNodeText(child));
            if (!text.isEmpty()) {
                blocks.add(text);
            }
        }
        return String.join("\n", blocks);
    }

    private static String extractNodeText(Node node) {
        StringBuilder builder = new StringBuilder();
        appendPlainText(node, builder);
        return builder.toString();
    }

    private static void appendPlainText(Node node, StringBuilder builder) {
        if (node instanceof TextNode textNode) {
            builder.append(textNode.getWholeText());
            return;
        }
        if (!(node instanceof Element element)) {
            return;
        }
        if ("br".equals(tagName(element))) {
            builder.append('\n');
            return;
        }
        for (Node child : element.childNodes()) {
            appendPlainText(child, builder);
        }
    }

    private static boolean isIgnorableTextNode(Node node) {
        return node instanceof TextNode textNode && textNode.getWholeText().isBlank();
    }

    private static boolean hasMeaningfulContent(Element element) {
        if (element == null) {
            return false;
        }
        return !element.text().isBlank() || !element.select("br").isEmpty();
    }

    private static boolean isBlockTag(String tagName) {
        return "h1".equals(tagName) || "p".equals(tagName);
    }

    private static boolean isInlineTag(String tagName) {
        return "strong".equals(tagName)
                || "em".equals(tagName)
                || "u".equals(tagName)
                || "span".equals(tagName);
    }

    private static String tagName(Element element) {
        return element.tagName().toLowerCase(Locale.ROOT);
    }

    private static String normalizePlainText(String plainText) {
        if (plainText == null) {
            return "";
        }
        String normalizedPlainText = plainText.replace("\r\n", "\n").replace('\r', '\n');
        normalizedPlainText = normalizedPlainText.replaceAll("[\\t\\x0B\\f ]*\\n[\\t\\x0B\\f ]*", "\n");
        normalizedPlainText = normalizedPlainText.replaceAll("\\n{3,}", "\n\n");
        return normalizedPlainText.trim();
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmedValue = value.trim();
        return trimmedValue.isEmpty() ? null : trimmedValue;
    }

    private static String escapeHtml(String value) {
        return new TextNode(value).outerHtml();
    }

    public record SanitizedRichText(String plainText, String richText) {
    }
}
