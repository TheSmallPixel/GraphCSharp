namespace SampleProject;

public interface IGreetingService
{
    string Greet(string name);
}

public class GreetingService : IGreetingService
{
    private readonly IFormatter _formatter;

    public GreetingService()
    {
        _formatter = new UpperCaseFormatter();
    }

    public string Greet(string name)
    {
        var raw = $"Hello, {name}!";
        return _formatter.Format(raw);
    }
}
