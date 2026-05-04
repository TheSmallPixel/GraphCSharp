namespace SampleProject;

public interface IFormatter
{
    string Format(string input);
}

public class UpperCaseFormatter : IFormatter
{
    public string Format(string input) => input.ToUpperInvariant();
}

public class LowerCaseFormatter : IFormatter
{
    public string Format(string input) => input.ToLowerInvariant();
}
