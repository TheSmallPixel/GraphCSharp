using System.Collections.Generic;

namespace CodeAnalysisTool
{
    public class D3Graph
    {
        public List<D3Node> Nodes { get; set; } = new List<D3Node>();
        public List<D3Link> Links { get; set; } = new List<D3Link>();
    }

    public class D3Node
    {
        public string Id { get; set; }
        public string Group { get; set; }
        public string Label { get; set; }
        public bool Used { get; set; } = false;
        public string Type { get; set; }
        public string FilePath { get; set; }
        public int LineNumber { get; set; }
        public bool IsExternal { get; set; } = false;
    }

    public class D3Link
    {
        public string Source { get; set; }
        public string Target { get; set; }
        public string Type { get; set; }
    }
}
